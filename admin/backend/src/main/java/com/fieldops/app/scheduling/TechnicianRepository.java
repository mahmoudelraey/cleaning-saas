package com.fieldops.app.scheduling;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TechnicianRepository extends JpaRepository<Technician, UUID> {

    @EntityGraph(attributePaths = "user")
    @Query("select t from Technician t order by t.user.name")
    List<Technician> findAllWithUser();

    @EntityGraph(attributePaths = "user")
    @Query("select t from Technician t where t.id = :id")
    Optional<Technician> findWithUser(@Param("id") UUID id);

    @EntityGraph(attributePaths = "user")
    @Query("select t from Technician t where t.user.id = :userId")
    Optional<Technician> findByUserId(@Param("userId") UUID userId);

    long countByActiveTrue();
}
