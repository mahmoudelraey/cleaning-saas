package com.fieldops.app.catalog;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ServiceOfferingRepository extends JpaRepository<ServiceOffering, UUID> {

    @EntityGraph(attributePaths = "addons")
    @Query("select s from ServiceOffering s order by s.name")
    List<ServiceOffering> findAllWithAddons();

    @EntityGraph(attributePaths = "addons")
    @Query("select s from ServiceOffering s where s.active = true order by s.name")
    List<ServiceOffering> findActiveWithAddons();

    @EntityGraph(attributePaths = "addons")
    @Query("select s from ServiceOffering s where s.id = :id")
    Optional<ServiceOffering> findWithAddons(@Param("id") UUID id);
}
