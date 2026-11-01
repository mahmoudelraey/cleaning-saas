package com.fieldops.app.geo;

import java.time.Duration;
import java.util.List;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public, cacheable lookup (used by the office app and the public booking page). Not under
 * /api/v1/public so the per-IP limit for anonymous endpoints does not apply to this static data.
 */
@RestController
@RequestMapping("/api/v1/geo")
public class GeoController {

    private static final CacheControl CACHE = CacheControl.maxAge(Duration.ofDays(1)).cachePublic();

    private final GeoService geo;

    public GeoController(GeoService geo) {
        this.geo = geo;
    }

    @GetMapping("/regions")
    public ResponseEntity<List<RegionDto>> regions() {
        return ResponseEntity.ok().cacheControl(CACHE)
                .body(geo.regions().stream().map(r -> new RegionDto(r.getId(), r.getCode(), r.getNameAr(), r.getNameEn())).toList());
    }

    @GetMapping("/cities")
    public ResponseEntity<List<CityDto>> cities() {
        return ResponseEntity.ok().cacheControl(CACHE)
                .body(geo.cities().stream().map(c -> new CityDto(c.getId(), c.getRegionId(), c.getNameAr(), c.getNameEn(),
                        c.getDistrictCount())).toList());
    }

    @GetMapping("/cities/{cityId}/districts")
    public ResponseEntity<List<DistrictDto>> districts(@PathVariable int cityId) {
        return ResponseEntity.ok().cacheControl(CACHE)
                .body(geo.districts(cityId).stream().map(d -> new DistrictDto(d.getId(), d.getNameAr(), d.getNameEn())).toList());
    }

    public record RegionDto(short id, String code, String nameAr, String nameEn) {
    }

    public record CityDto(int id, short regionId, String nameAr, String nameEn, int districtCount) {
    }

    public record DistrictDto(long id, String nameAr, String nameEn) {
    }
}
