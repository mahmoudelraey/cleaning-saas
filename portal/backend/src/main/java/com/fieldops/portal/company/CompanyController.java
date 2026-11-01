package com.fieldops.portal.company;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fieldops.portal.admin.AdminClient;
import com.fieldops.portal.admin.AdminDtos;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public part of a company's portal: who they are, what they offer, prices and open times. */
@RestController
@RequestMapping("/api/portal/{slug}")
public class CompanyController {

    private final CompanyService companies;
    private final AdminClient admin;

    public CompanyController(CompanyService companies, AdminClient admin) {
        this.companies = companies;
        this.admin = admin;
    }

    @GetMapping
    public AdminDtos.Company company(@PathVariable String slug) {
        return companies.get(slug);
    }

    @GetMapping("/services")
    public List<AdminDtos.Service> services(@PathVariable String slug) {
        return admin.get(slug, "/services", new ParameterizedTypeReference<List<AdminDtos.Service>>() { });
    }

    @PostMapping("/quote")
    public AdminDtos.Quote quote(@PathVariable String slug, @Valid @RequestBody ItemsRequest req) {
        return admin.post(slug, "/quote", new AdminDtos.ItemsBody(req.items()), AdminDtos.Quote.class);
    }

    @PostMapping("/availability")
    public List<AdminDtos.Slot> availability(@PathVariable String slug, @Valid @RequestBody AvailabilityRequest req) {
        return admin.post(slug, "/availability", new AdminDtos.AvailabilityBody(req.date(), req.items()),
                new ParameterizedTypeReference<List<AdminDtos.Slot>>() { });
    }

    public record ItemsRequest(@NotEmpty @Size(max = 10) List<AdminDtos.@NotNull Item> items) {
    }

    public record AvailabilityRequest(@NotNull java.time.LocalDate date, @NotEmpty @Size(max = 10) List<AdminDtos.@NotNull Item> items) {
    }
}
