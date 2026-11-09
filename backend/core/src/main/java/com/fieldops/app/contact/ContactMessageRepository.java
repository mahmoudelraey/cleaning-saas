package com.fieldops.app.contact;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContactMessageRepository extends JpaRepository<ContactMessage, UUID> {

    List<ContactMessage> findByStatusOrderByCreatedAtDesc(ContactMessage.Status status, Pageable page);

    List<ContactMessage> findAllByOrderByCreatedAtDesc(Pageable page);

    long countByStatus(ContactMessage.Status status);

    long countByPhoneAndCreatedAtAfter(String phone, Instant after);
}
