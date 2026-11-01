package com.fieldops.app.billing;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BillingIT extends IntegrationTest {

    private static final ZoneId RIYADH = ZoneId.of("Asia/Riyadh");
    private static final String VAT = "310122393500003";
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};

    @org.springframework.beans.factory.annotation.Autowired
    private AutoInvoiceService autoInvoices;

    private Session owner;
    private String customerId;
    private String serviceId;
    private String addonId;

    @BeforeEach
    void seed() throws Exception {
        owner = signupCompany("bill");
        customerId = readJson(postAs(owner, "/api/v1/customers", Map.of("name", "نورة القحطاني", "phone", uniquePhone()))
                .andExpect(status().isCreated())).get("id").asText();
        serviceId = readJson(postAs(owner, "/api/v1/services", Map.of("name", "تنظيف شقة", "pricingType", "FIXED",
                "basePriceHalalas", 30000, "durationMin", 120)).andExpect(status().isCreated())).get("id").asText();
        addonId = readJson(postAs(owner, "/api/v1/services/" + serviceId + "/addons",
                Map.of("name", "ثلاجة", "priceHalalas", 5000)).andExpect(status().isCreated())).get("id").asText();
    }

    private void companySettings(String vatNumber, boolean pricesIncludeVat) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "لمعة للتنظيف");
        body.put("vatNumber", vatNumber);
        body.put("address", "الرياض، حي النرجس");
        body.put("commercialRegistration", "1010123456");
        body.put("pricesIncludeVat", pricesIncludeVat);
        putAs(owner, "/api/v1/tenant", body).andExpect(status().isOk())
                .andExpect(jsonPath("$.pricesIncludeVat").value(pricesIncludeVat));
    }

    private String booking() throws Exception {
        LocalDate sunday = LocalDate.now(RIYADH).with(TemporalAdjusters.next(DayOfWeek.SUNDAY));
        return readJson(postAs(owner, "/api/v1/bookings", Map.of(
                "customerId", customerId,
                "scheduledStart", sunday.atTime(9, 0).atZone(RIYADH).toInstant().toString(),
                "items", List.of(Map.of("serviceId", serviceId, "addonIds", List.of(addonId))))) // 300 + 50
                .andExpect(status().isCreated())).get("id").asText();
    }

    private void complete(String bookingId) throws Exception {
        String tech = readJson(postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", uniquePhone(),
                "password", "Tech#123456", "workHours", List.of(Map.of("day", "SUNDAY", "start", "08:00", "end", "17:00")))))
                .get("id").asText();
        postAs(owner, "/api/v1/bookings/" + bookingId + "/assign", Map.of("technicianIds", List.of(tech)))
                .andExpect(status().isOk());
        for (String st : List.of("ON_THE_WAY", "IN_PROGRESS", "COMPLETED")) {
            patchAs(owner, "/api/v1/bookings/" + bookingId + "/status", Map.of("status", st)).andExpect(status().isOk());
        }
    }

    @Test
    void completingAVisitIssuesAndSendsTheInvoiceAutomatically() throws Exception {
        companySettings(VAT, false);
        String bookingId = booking();
        complete(bookingId);
        getAs(owner, "/api/v1/bookings/" + bookingId).andExpect(jsonPath("$.invoiceState").value("PENDING"));

        // The scheduled job (disabled in tests) issues it; running it twice issues only one invoice.
        assertThat(autoInvoices.processTenant(owner.tenantId())).isEqualTo(1);
        assertThat(autoInvoices.processTenant(owner.tenantId())).isZero();
        getAs(owner, "/api/v1/bookings/" + bookingId).andExpect(jsonPath("$.invoiceState").value("ISSUED"));

        JsonNode list = readJson(getAs(owner, "/api/v1/bookings/" + bookingId + "/invoices").andExpect(status().isOk()));
        assertThat(list.size()).isEqualTo(1);
        assertThat(list.get(0).get("totalHalalas").asLong()).isEqualTo(40250);
        assertThat(readJson(getAs(owner, "/api/v1/notifications")).toString()).contains("INVOICE_ISSUED");
    }

    @Test
    void automaticInvoicesCanBeTurnedOff() throws Exception {
        putAs(owner, "/api/v1/tenant", Map.of("name", "لمعة", "autoInvoice", false))
                .andExpect(status().isOk()).andExpect(jsonPath("$.autoInvoice").value(false));
        String bookingId = booking();
        complete(bookingId);
        assertThat(autoInvoices.processTenant(owner.tenantId())).isZero();
        getAs(owner, "/api/v1/bookings/" + bookingId + "/invoices").andExpect(jsonPath("$.length()").value(0));
        getAs(owner, "/api/v1/bookings/" + bookingId).andExpect(jsonPath("$.invoiceState").value("NONE"));
    }

    @Test
    void manualInvoiceBeforeTheJobRunsIsNotDuplicated() throws Exception {
        String bookingId = booking();
        complete(bookingId);
        invoiceFor(bookingId); // office was quicker than the job
        assertThat(autoInvoices.processTenant(owner.tenantId())).isZero();
        getAs(owner, "/api/v1/bookings/" + bookingId + "/invoices").andExpect(jsonPath("$.length()").value(1));
    }

    private JsonNode invoiceFor(String bookingId) throws Exception {
        return readJson(postAs(owner, "/api/v1/bookings/" + bookingId + "/invoice", Map.of())
                .andExpect(status().isCreated()));
    }

    @Test
    void vatInvoiceFromBookingIsNumberedOncePerBookingAndCanBeReissuedAfterVoid() throws Exception {
        companySettings(VAT, false);
        String bookingId = booking();

        JsonNode inv = invoiceFor(bookingId);
        assertThat(inv.get("number").asLong()).isEqualTo(1);
        assertThat(inv.get("status").asText()).isEqualTo("ISSUED");
        assertThat(inv.get("vatInvoice").asBoolean()).isTrue();
        assertThat(inv.get("taxableHalalas").asLong()).isEqualTo(35000);
        assertThat(inv.get("vatHalalas").asLong()).isEqualTo(5250);
        assertThat(inv.get("totalHalalas").asLong()).isEqualTo(40250);
        assertThat(inv.get("lines").size()).isEqualTo(2);
        assertThat(inv.get("sellerVatNumber").asText()).isEqualTo(VAT);
        assertThat(inv.get("sellerCr").asText()).isEqualTo("1010123456");
        assertThat(inv.get("zatcaQr").asText()).isNotBlank();

        postAs(owner, "/api/v1/bookings/" + bookingId + "/invoice", Map.of())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("already_invoiced"));

        String id = inv.get("id").asText();
        postAs(owner, "/api/v1/invoices/" + id + "/void", Map.of("reason", "خطأ في السعر"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VOID"))
                .andExpect(jsonPath("$.balanceHalalas").value(0));

        // Seller details are a snapshot: later profile changes do not alter issued invoices.
        companySettings(VAT, true);
        getAs(owner, "/api/v1/invoices/" + id).andExpect(jsonPath("$.taxableHalalas").value(35000));

        JsonNode again = invoiceFor(bookingId);
        assertThat(again.get("number").asLong()).isEqualTo(2); // gap-free sequence
        assertThat(again.get("taxableHalalas").asLong()).isEqualTo(30435); // now VAT-inclusive pricing
        assertThat(again.get("vatHalalas").asLong()).isEqualTo(4565);
        assertThat(again.get("totalHalalas").asLong()).isEqualTo(35000);

        getAs(owner, "/api/v1/bookings/" + bookingId + "/invoices").andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void companyWithoutVatNumberIssuesPlainInvoiceWithoutQr() throws Exception {
        JsonNode inv = invoiceFor(booking());
        assertThat(inv.get("vatInvoice").asBoolean()).isFalse();
        assertThat(inv.get("vatHalalas").asLong()).isZero();
        assertThat(inv.get("totalHalalas").asLong()).isEqualTo(35000);
        assertThat(inv.get("zatcaQr").isNull()).isTrue();
    }

    @Test
    void paymentsSettleTheInvoiceAndBlockVoiding() throws Exception {
        companySettings(VAT, false);
        String id = invoiceFor(booking()).get("id").asText();

        postAs(owner, "/api/v1/invoices/" + id + "/payments", Map.of("method", "CASH", "amountHalalas", 50000))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_amount"));
        postAs(owner, "/api/v1/invoices/" + id + "/payments", Map.of("method", "MADA", "amountHalalas", 20000,
                "reference", "POS-881")).andExpect(status().isCreated());
        getAs(owner, "/api/v1/invoices/" + id)
                .andExpect(jsonPath("$.status").value("PARTIALLY_PAID"))
                .andExpect(jsonPath("$.balanceHalalas").value(20250))
                .andExpect(jsonPath("$.payments.length()").value(1));

        postAs(owner, "/api/v1/invoices/" + id + "/void", Map.of("reason", "x"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("invoice_has_payments"));

        postAs(owner, "/api/v1/invoices/" + id + "/payments", Map.of("method", "BANK_TRANSFER", "amountHalalas", 20250))
                .andExpect(status().isCreated());
        getAs(owner, "/api/v1/invoices/" + id).andExpect(jsonPath("$.status").value("PAID"));
        getAs(owner, "/api/v1/invoices?status=UNPAID").andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void standaloneInvoiceTakesCatalogPricesAndFreeTextLines() throws Exception {
        companySettings(VAT, false);
        JsonNode inv = readJson(postAs(owner, "/api/v1/invoices", Map.of(
                "customerId", customerId,
                "discountHalalas", 1000,
                "lines", List.of(
                        Map.of("serviceId", serviceId, "quantity", 2),
                        Map.of("description", "مواد تنظيف إضافية", "quantity", 1.5, "unitPriceHalalas", 2000))))
                .andExpect(status().isCreated()));
        assertThat(inv.get("linesTotalHalalas").asLong()).isEqualTo(63000); // 2×300 + 1.5×20
        assertThat(inv.get("taxableHalalas").asLong()).isEqualTo(62000);
        assertThat(inv.get("vatHalalas").asLong()).isEqualTo(9300);
        assertThat(inv.get("totalHalalas").asLong()).isEqualTo(71300);

        postAs(owner, "/api/v1/invoices", Map.of("customerId", customerId,
                "lines", List.of(Map.of("description", "بدون سعر")))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_price"));
    }

    @Test
    void quoteIsSharedAcceptedByCustomerAndConvertedToInvoice() throws Exception {
        companySettings(VAT, false);
        JsonNode quote = readJson(postAs(owner, "/api/v1/quotes", Map.of(
                "customerId", customerId,
                "lines", List.of(Map.of("serviceId", serviceId, "addonIds", List.of(addonId))),
                "notes", "يشمل المواد"))
                .andExpect(status().isCreated()));
        assertThat(quote.get("status").asText()).isEqualTo("DRAFT");
        assertThat(quote.get("totalHalalas").asLong()).isEqualTo(40250);
        String id = quote.get("id").asText();

        String link = readJson(postAs(owner, "/api/v1/quotes/" + id + "/send", Map.of())
                .andExpect(status().isOk())).get("url").asText();
        assertThat(link).contains("/q/");
        String token = link.substring(link.lastIndexOf('/') + 1);

        // Public page: no login.
        mvc.perform(get("/api/v1/public/quotes/" + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quote.status").value("SENT"))
                .andExpect(jsonPath("$.company.name").value("لمعة للتنظيف"))
                .andExpect(jsonPath("$.quote.publicUrl").doesNotExist());
        mvc.perform(get("/api/v1/public/invoices/" + token)).andExpect(status().isNotFound()); // wrong type
        mvc.perform(get("/api/v1/public/quotes/" + "A".repeat(43))).andExpect(status().isNotFound());

        mvc.perform(post("/api/v1/public/quotes/" + token + "/accept"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quote.status").value("ACCEPTED"));
        mvc.perform(post("/api/v1/public/quotes/" + token + "/reject"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("quote_closed"));

        JsonNode inv = readJson(postAs(owner, "/api/v1/quotes/" + id + "/invoice", Map.of())
                .andExpect(status().isCreated()));
        assertThat(inv.get("totalHalalas").asLong()).isEqualTo(40250);
        assertThat(inv.get("quoteId").asText()).isEqualTo(id);
        getAs(owner, "/api/v1/quotes/" + id).andExpect(jsonPath("$.invoiceId").value(inv.get("id").asText()));
        postAs(owner, "/api/v1/quotes/" + id + "/invoice", Map.of())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("already_invoiced"));
    }

    @Test
    void sendingAnInvoiceQueuesAMessageWithThePublicLink() throws Exception {
        String id = invoiceFor(booking()).get("id").asText();
        String url = readJson(postAs(owner, "/api/v1/invoices/" + id + "/send", Map.of())
                .andExpect(status().isOk())).get("url").asText();
        String token = url.substring(url.lastIndexOf('/') + 1);

        JsonNode messages = readJson(getAs(owner, "/api/v1/notifications").andExpect(status().isOk()));
        assertThat(messages.toString()).contains("INVOICE_ISSUED").contains(token);

        mvc.perform(get("/api/v1/public/invoices/" + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invoice.number").value(1))
                .andExpect(jsonPath("$.invoice.payments.length()").value(0));
        mvc.perform(get("/api/v1/public/invoices/" + token + "/pdf"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF));
        // Same link every time.
        assertThat(readJson(postAs(owner, "/api/v1/invoices/" + id + "/link", Map.of())).get("url").asText()).isEqualTo(url);
    }

    @Test
    void pdfsRenderForInvoicesAndQuotes() throws Exception {
        companySettings(VAT, false);
        String id = invoiceFor(booking()).get("id").asText();
        byte[] pdf = getAs(owner, "/api/v1/invoices/" + id + "/pdf")
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(new String(pdf, 0, 5)).isEqualTo("%PDF-");

        String quoteId = readJson(postAs(owner, "/api/v1/bookings/" + booking() + "/quote", Map.of())
                .andExpect(status().isCreated())).get("id").asText();
        getAs(owner, "/api/v1/quotes/" + quoteId + "/pdf").andExpect(status().isOk());
    }

    @Test
    void billingIsIsolatedBetweenCompaniesAndHiddenFromTechnicians() throws Exception {
        String id = invoiceFor(booking()).get("id").asText();
        Session other = signupCompany("bill-other");
        getAs(other, "/api/v1/invoices/" + id).andExpect(status().isNotFound());
        getAs(other, "/api/v1/invoices").andExpect(jsonPath("$.total").value(0));
        postAs(other, "/api/v1/invoices/" + id + "/payments", Map.of("method", "CASH", "amountHalalas", 100))
                .andExpect(status().isNotFound());

        String techPhone = uniquePhone();
        postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", techPhone, "password", "Tech#123456",
                "workHours", List.of())).andExpect(status().isCreated());
        Session tech = login(techPhone, "Tech#123456");
        getAs(tech, "/api/v1/invoices").andExpect(status().isForbidden());
        getAs(tech, "/api/v1/invoices/" + id + "/pdf").andExpect(status().isForbidden());
    }

    @Test
    void ownerUploadsLogoServedPubliclyBySlug() throws Exception {
        switchPlan(owner, "business"); // branding is a Business feature
        JsonNode tenant = readJson(getAs(owner, "/api/v1/tenant"));
        assertThat(tenant.get("logoUrl").isNull()).isTrue();

        mvc.perform(multipart("/api/v1/tenant/logo")
                        .file(new MockMultipartFile("file", "logo.html", "image/png", "<script>".getBytes()))
                        .header("Authorization", "Bearer " + owner.accessToken()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("unsupported_file"));

        JsonNode updated = readJson(mvc.perform(multipart("/api/v1/tenant/logo")
                        .file(new MockMultipartFile("file", "logo.png", "image/png", PNG))
                        .header("Authorization", "Bearer " + owner.accessToken()))
                .andExpect(status().isOk()));
        String logoUrl = updated.get("logoUrl").asText();
        assertThat(logoUrl).startsWith("/api/v1/public/tenants/" + tenant.get("slug").asText() + "/logo?v=");

        mvc.perform(get(logoUrl))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(content().bytes(PNG));
    }
}
