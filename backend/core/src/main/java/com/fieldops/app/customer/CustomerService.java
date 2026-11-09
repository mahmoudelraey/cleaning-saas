package com.fieldops.app.customer;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.geo.GeoService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerService {

    private final CustomerRepository customers;
    private final GeoService geo;
    private final Clock clock;

    public CustomerService(CustomerRepository customers, GeoService geo, Clock clock) {
        this.customers = customers;
        this.geo = geo;
        this.clock = clock;
    }

    public record CustomerData(String name, String phone, String email, String notes) {
    }

    /** cityId/districtId come from the Saudi lookup; city/district text is only used when they are absent. */
    public record AddressData(String label, String city, String district, String details,
                              BigDecimal lat, BigDecimal lng, String mapUrl, Integer cityId, Long districtId) {
    }

    @Transactional(readOnly = true)
    public Page<Customer> search(String q, Pageable pageable) {
        if (q == null || q.isBlank()) {
            return customers.findAll(pageable);
        }
        String term = q.trim();
        // Searching "0551234567" should match the stored "+966551234567".
        String asPhone = PhoneNumbers.normalizeSaudiMobile(term).map(p -> p.substring(4)).orElse(null);
        return customers.search(asPhone != null ? asPhone : PhoneNumbers.toAsciiDigits(term), pageable);
    }

    @Transactional(readOnly = true)
    public Customer get(UUID id) {
        return customers.findWithAddresses(id).orElseThrow(() -> ApiException.notFound("customer"));
    }

    @Transactional
    public Customer create(CustomerData data) {
        String phone = normalizePhone(data.phone());
        if (customers.existsByPhone(phone)) {
            throw ApiException.conflict("customer_phone_exists", "A customer with this phone already exists");
        }
        return customers.save(new Customer(data.name().trim(), phone, blankToNull(data.email()),
                blankToNull(data.notes())));
    }

    /** Public booking page: the verified phone identifies the customer; a new one is created on first booking. */
    @Transactional
    public Customer findOrCreateByPhone(String name, String e164Phone) {
        return customers.findByPhone(e164Phone)
                .orElseGet(() -> customers.save(new Customer(name.trim(), e164Phone, null, null)));
    }

    @Transactional
    public Customer update(UUID id, CustomerData data) {
        Customer c = get(id);
        String phone = normalizePhone(data.phone());
        if (customers.existsByPhoneAndIdNot(phone, id)) {
            throw ApiException.conflict("customer_phone_exists", "A customer with this phone already exists");
        }
        c.update(data.name().trim(), phone, blankToNull(data.email()), blankToNull(data.notes()));
        return c;
    }

    @Transactional
    public void delete(UUID id) {
        Customer c = get(id);
        c.softDelete(Instant.now(clock));
    }

    @Transactional
    public Address addAddress(UUID customerId, AddressData data) {
        Customer c = get(customerId);
        Address address = new Address(data.label().trim(), null, null, null, null, null, null);
        apply(address, data);
        c.addAddress(address);
        customers.flush();
        return address;
    }

    @Transactional
    public Address updateAddress(UUID customerId, UUID addressId, AddressData data) {
        Address a = findAddress(get(customerId), addressId);
        apply(a, data);
        return a;
    }

    @Transactional
    public void deleteAddress(UUID customerId, UUID addressId) {
        Customer c = get(customerId);
        // Archived, not deleted: past and upcoming bookings read their location from this row.
        findAddress(c, addressId).archive(Instant.now(clock));
    }

    /**
     * With lookup ids, the printed city/district names come from the lookup (Arabic); a city without
     * district data may still carry a typed district. Without ids the typed text is kept as is.
     */
    private void apply(Address a, AddressData data) {
        GeoService.Place place = geo.resolve(data.cityId(), data.districtId());
        String city = blankToNull(data.city());
        String district = blankToNull(data.district());
        if (place != null) {
            city = place.city().getNameAr();
            if (place.district() != null) {
                district = place.district().getNameAr();
            }
        }
        a.update(data.label().trim(), city, district, blankToNull(data.details()), data.lat(), data.lng(),
                blankToNull(data.mapUrl()));
        a.setPlace(place == null ? null : place.city().getId(),
                place == null || place.district() == null ? null : place.district().getId());
    }

    private static Address findAddress(Customer c, UUID addressId) {
        return c.getAddresses().stream()
                .filter(a -> a.getId().equals(addressId))
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("address"));
    }

    private static String normalizePhone(String raw) {
        return PhoneNumbers.normalizeSaudiMobile(raw)
                .orElseThrow(() -> ApiException.badRequest("invalid_phone", "Invalid Saudi mobile number"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
