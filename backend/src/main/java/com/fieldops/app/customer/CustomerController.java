package com.fieldops.app.customer;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.util.SaudiMobile;
import com.fieldops.app.common.web.PageResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customers")
@PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
public class CustomerController {

    private final CustomerService service;

    public CustomerController(CustomerService service) {
        this.service = service;
    }

    @GetMapping
    public PageResponse<CustomerSummary> list(@RequestParam(required = false) String q,
                                              @RequestParam(defaultValue = "0") @Min(0) int page,
                                              @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return PageResponse.of(service.search(q, pageable), CustomerSummary::of);
    }

    @GetMapping("/{id}")
    public CustomerDetail get(@PathVariable UUID id) {
        return CustomerDetail.of(service.get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerDetail create(@Valid @RequestBody CustomerRequest req) {
        return CustomerDetail.of(service.create(req.toData()));
    }

    @PutMapping("/{id}")
    public CustomerDetail update(@PathVariable UUID id, @Valid @RequestBody CustomerRequest req) {
        return CustomerDetail.of(service.update(id, req.toData()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }

    @PostMapping("/{id}/addresses")
    @ResponseStatus(HttpStatus.CREATED)
    public AddressDto addAddress(@PathVariable UUID id, @Valid @RequestBody AddressRequest req) {
        return AddressDto.of(service.addAddress(id, req.toData()));
    }

    @PutMapping("/{id}/addresses/{addressId}")
    public AddressDto updateAddress(@PathVariable UUID id, @PathVariable UUID addressId,
                                    @Valid @RequestBody AddressRequest req) {
        return AddressDto.of(service.updateAddress(id, addressId, req.toData()));
    }

    @DeleteMapping("/{id}/addresses/{addressId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAddress(@PathVariable UUID id, @PathVariable UUID addressId) {
        service.deleteAddress(id, addressId);
    }

    // --- DTOs ---------------------------------------------------------------------------------------

    public record CustomerRequest(
            @NotBlank @Size(max = 150) String name,
            @NotBlank @SaudiMobile String phone,
            @Email @Size(max = 200) String email,
            @Size(max = 2000) String notes) {
        CustomerService.CustomerData toData() {
            return new CustomerService.CustomerData(name, phone, email, notes);
        }
    }

    public record AddressRequest(
            @NotBlank @Size(max = 50) String label,
            @Size(max = 80) String city,
            @Size(max = 80) String district,
            @Size(max = 500) String details,
            @DecimalMin("-90") @DecimalMax("90") BigDecimal lat,
            @DecimalMin("-180") @DecimalMax("180") BigDecimal lng,
            @Size(max = 500) String mapUrl,
            Integer cityId,
            Long districtId) {
        CustomerService.AddressData toData() {
            return new CustomerService.AddressData(label, city, district, details, lat, lng, mapUrl, cityId, districtId);
        }
    }

    public record CustomerSummary(UUID id, String name, String phone, String email, Instant createdAt) {
        static CustomerSummary of(Customer c) {
            return new CustomerSummary(c.getId(), c.getName(), c.getPhone(), c.getEmail(), c.getCreatedAt());
        }
    }

    public record CustomerDetail(UUID id, String name, String phone, String email, String notes,
                                 Instant createdAt, List<AddressDto> addresses) {
        static CustomerDetail of(Customer c) {
            return new CustomerDetail(c.getId(), c.getName(), c.getPhone(), c.getEmail(), c.getNotes(),
                    c.getCreatedAt(), c.getAddresses().stream().map(AddressDto::of).toList());
        }
    }

    public record AddressDto(UUID id, String label, String city, String district, String details,
                             BigDecimal lat, BigDecimal lng, String mapUrl, String navigationUrl,
                             Integer cityId, Long districtId) {
        static AddressDto of(Address a) {
            return new AddressDto(a.getId(), a.getLabel(), a.getCity(), a.getDistrict(), a.getDetails(),
                    a.getLat(), a.getLng(), a.getMapUrl(), a.navigationUrl(), a.getCityId(), a.getDistrictId());
        }
    }
}
