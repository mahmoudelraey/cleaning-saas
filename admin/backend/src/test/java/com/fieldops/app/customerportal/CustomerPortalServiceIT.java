package com.fieldops.app.customerportal;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingPricing;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.booking.PaymentMethod;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.customer.Customer;
import com.fieldops.app.scheduling.SchedulingService;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The shared core service the customer portal backend calls directly (same rules as the admin app). */
class CustomerPortalServiceIT extends IntegrationTest {

    private static final ZoneId RIYADH = ZoneId.of("Asia/Riyadh");

    @Autowired
    private CustomerPortalService portal;

    private Session owner;
    private String slug;
    private UUID serviceId;

    @BeforeEach
    void seed() throws Exception {
        owner = signupCompany("portal");
        slug = readJson(getAs(owner, "/api/v1/tenant")).get("slug").asText();
        serviceId = UUID.fromString(readJson(postAs(owner, "/api/v1/services", Map.of("name", "تنظيف فيلا",
                "pricingType", "FIXED", "basePriceHalalas", 40000, "durationMin", 120))
                .andExpect(status().isCreated())).get("id").asText());
        List<Map<String, String>> everyDay = java.util.stream.Stream.of("SATURDAY", "SUNDAY", "MONDAY", "TUESDAY",
                "WEDNESDAY", "THURSDAY", "FRIDAY").map(d -> Map.of("day", d, "start", "08:00", "end", "18:00")).toList();
        postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", uniquePhone(), "password", "Tech#123456",
                "workHours", everyDay)).andExpect(status().isCreated());
    }

    @Test
    void newCustomerSignsInRegistersBooksAndCancels() throws Exception {
        String phone = uniquePhone();
        String code = portal.sendCode(slug, phone).devCode();
        CustomerPortalService.Identity who = portal.verify(slug, phone, code);
        assertThat(who.customerId()).isNull(); // first visit

        Customer c = portal.register(slug, phone, "هند القحطاني");
        List<BookingPricing.Line> items = List.of(new BookingPricing.Line(serviceId, null, List.of()));
        List<SchedulingService.Slot> slots = portal.availability(slug, LocalDate.now(RIYADH).plusDays(4), items);
        Instant start = slots.get(0).start();

        Booking b = portal.book(slug, c.getId(), new CustomerPortalService.NewBooking(items, start, null,
                new CustomerPortalService.AddressInput("الرياض", "النرجس", null, null, null, null, null, null),
                null, PaymentMethod.CASH));
        assertThat(b.getStatus()).isEqualTo(BookingStatus.NEW);

        // The office sees where it came from.
        getAs(owner, "/api/v1/bookings/" + b.getId())
                .andExpect(jsonPath("$.source").value("PORTAL"))
                .andExpect(jsonPath("$.paymentMethod").value("CASH"))
                .andExpect(jsonPath("$.events[0].note").value("portal"));

        // Someone else can't cancel it; the customer can.
        assertThatThrownBy(() -> portal.cancel(slug, UUID.randomUUID(), b.getId(), null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("booking_not_found");
        assertThat(portal.cancel(slug, c.getId(), b.getId(), "سفر").getStatus()).isEqualTo(BookingStatus.CANCELLED);
        getAs(owner, "/api/v1/bookings/" + b.getId()).andExpect(jsonPath("$.cancelReason").value("سفر"));
    }
}
