package com.fieldops.app.geo;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GeoDistrictRepository extends JpaRepository<GeoDistrict, Long> {

    List<GeoDistrict> findByCityIdOrderByNameArAsc(Integer cityId);
}
