package com.fieldops.app.billing;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** Global table (no RLS): looked up by token before any tenant is known. */
public interface PublicLinkRepository extends JpaRepository<PublicLink, String> {

    Optional<PublicLink> findByDocumentTypeAndDocumentId(PublicLink.Type type, UUID documentId);
}
