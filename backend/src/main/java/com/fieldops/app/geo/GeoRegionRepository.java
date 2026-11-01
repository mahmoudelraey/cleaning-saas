package com.fieldops.app.geo;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GeoRegionRepository extends JpaRepository<GeoRegion, Short> {

    List<GeoRegion> findAllByOrderByIdAsc();
}
