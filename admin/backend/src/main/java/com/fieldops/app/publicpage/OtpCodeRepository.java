package com.fieldops.app.publicpage;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OtpCodeRepository extends JpaRepository<OtpCode, UUID> {

    long countByPhoneAndCreatedAtAfter(String phone, Instant after);

    long countByCreatedAtAfter(Instant after);

    Optional<OtpCode> findFirstByPhoneOrderByCreatedAtDesc(String phone);

    Optional<OtpCode> findBySessionHash(String sessionHash);
}
