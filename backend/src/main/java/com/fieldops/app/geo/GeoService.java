package com.fieldops.app.geo;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.fieldops.app.common.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lookup of Saudi regions, cities and districts. The data only changes with a migration, so it is
 * cached in memory after the first read.
 */
@Service
public class GeoService {

    private final GeoRegionRepository regions;
    private final GeoCityRepository cities;
    private final GeoDistrictRepository districts;

    private volatile List<GeoRegion> regionCache;
    private volatile List<GeoCity> cityCache;
    private final Map<Integer, List<GeoDistrict>> districtCache = new ConcurrentHashMap<>();

    public GeoService(GeoRegionRepository regions, GeoCityRepository cities, GeoDistrictRepository districts) {
        this.regions = regions;
        this.cities = cities;
        this.districts = districts;
    }

    /** A resolved city/district pair for an address (names are what gets printed). */
    public record Place(GeoCity city, GeoDistrict district) {
    }

    @Transactional(readOnly = true)
    public List<GeoRegion> regions() {
        List<GeoRegion> r = regionCache;
        if (r == null) {
            r = List.copyOf(regions.findAllByOrderByIdAsc());
            regionCache = r;
        }
        return r;
    }

    @Transactional(readOnly = true)
    public List<GeoCity> cities() {
        List<GeoCity> c = cityCache;
        if (c == null) {
            c = List.copyOf(cities.findAllByOrderByDistrictCountDescNameArAsc());
            cityCache = c;
        }
        return c;
    }

    @Transactional(readOnly = true)
    public List<GeoDistrict> districts(int cityId) {
        return districtCache.computeIfAbsent(cityId, id -> List.copyOf(districts.findByCityIdOrderByNameArAsc(id)));
    }

    /**
     * Validates an address's city/district ids. A district alone implies its city; a district from another
     * city is rejected. Returns null when neither is given (free-text address).
     */
    @Transactional(readOnly = true)
    public Place resolve(Integer cityId, Long districtId) {
        if (cityId == null && districtId == null) {
            return null;
        }
        GeoDistrict district = null;
        if (districtId != null) {
            district = districts.findById(districtId)
                    .orElseThrow(() -> ApiException.badRequest("invalid_district", "Unknown district"));
            if (cityId != null && !cityId.equals(district.getCityId())) {
                throw ApiException.badRequest("invalid_district", "The district is not in the selected city");
            }
            cityId = district.getCityId();
        }
        GeoCity city = cities.findById(cityId)
                .orElseThrow(() -> ApiException.badRequest("invalid_city", "Unknown city"));
        return new Place(city, district);
    }
}
