package com.fieldops.app.geo;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GeoCityRepository extends JpaRepository<GeoCity, Integer> {

    /** Cities with district data first (the big ones), then alphabetically. */
    List<GeoCity> findAllByOrderByDistrictCountDescNameArAsc();
}
