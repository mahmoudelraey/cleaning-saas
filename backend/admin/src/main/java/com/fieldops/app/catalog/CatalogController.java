package com.fieldops.app.catalog;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

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

/** Services & prices. Everyone on staff can read; only the owner changes prices. */
@RestController
@RequestMapping("/api/v1/services")
public class CatalogController {

    private final CatalogService service;

    public CatalogController(CatalogService service) {
        this.service = service;
    }

    @GetMapping
    public List<ServiceDto> list(@RequestParam(defaultValue = "false") boolean activeOnly) {
        return service.list(activeOnly).stream().map(ServiceDto::of).toList();
    }

    @GetMapping("/{id}")
    public ServiceDto get(@PathVariable UUID id) {
        return ServiceDto.of(service.get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('OWNER')")
    public ServiceDto create(@Valid @RequestBody ServiceRequest req) {
        return ServiceDto.of(service.create(req.toData()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    public ServiceDto update(@PathVariable UUID id, @Valid @RequestBody ServiceRequest req) {
        return ServiceDto.of(service.update(id, req.toData()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('OWNER')")
    public void archive(@PathVariable UUID id) {
        service.archive(id);
    }

    @PostMapping("/{id}/addons")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('OWNER')")
    public AddonDto addAddon(@PathVariable UUID id, @Valid @RequestBody AddonRequest req) {
        return AddonDto.of(service.addAddon(id, req.toData()));
    }

    @PutMapping("/{id}/addons/{addonId}")
    @PreAuthorize("hasRole('OWNER')")
    public AddonDto updateAddon(@PathVariable UUID id, @PathVariable UUID addonId,
                                @Valid @RequestBody AddonRequest req) {
        return AddonDto.of(service.updateAddon(id, addonId, req.toData()));
    }

    @DeleteMapping("/{id}/addons/{addonId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('OWNER')")
    public void deleteAddon(@PathVariable UUID id, @PathVariable UUID addonId) {
        service.deleteAddon(id, addonId);
    }

    // --- DTOs ---------------------------------------------------------------------------------------

    public record ServiceRequest(
            @NotBlank @Size(max = 150) String name,
            @Size(max = 1000) String description,
            @Size(max = 150) String nameEn,
            @Size(max = 1000) String descriptionEn,
            @NotNull PricingType pricingType,
            @Min(0) @Max(100_000_000) long basePriceHalalas,
            @Min(5) @Max(24 * 60) int durationMin,
            Boolean active) {
        CatalogService.ServiceData toData() {
            return new CatalogService.ServiceData(name, description, nameEn, descriptionEn, pricingType,
                    basePriceHalalas, durationMin, active == null || active);
        }
    }

    public record AddonRequest(
            @NotBlank @Size(max = 150) String name,
            @Size(max = 150) String nameEn,
            @Min(0) @Max(100_000_000) long priceHalalas,
            Boolean active) {
        CatalogService.AddonData toData() {
            return new CatalogService.AddonData(name, nameEn, priceHalalas, active == null || active);
        }
    }

    public record AddonDto(UUID id, String name, String nameEn, long priceHalalas, boolean active) {
        static AddonDto of(ServiceAddon a) {
            return new AddonDto(a.getId(), a.getName(), a.getNameEn(), a.getPriceHalalas(), a.isActive());
        }
    }

    public record ServiceDto(UUID id, String name, String description, String nameEn, String descriptionEn,
                             PricingType pricingType, long basePriceHalalas, int durationMin, boolean active,
                             List<AddonDto> addons) {
        static ServiceDto of(ServiceOffering s) {
            return new ServiceDto(s.getId(), s.getName(), s.getDescription(), s.getNameEn(), s.getDescriptionEn(),
                    s.getPricingType(),
                    s.getBasePriceHalalas(), s.getDurationMin(), s.isActive(),
                    s.getAddons().stream().map(AddonDto::of).toList());
        }
    }
}
