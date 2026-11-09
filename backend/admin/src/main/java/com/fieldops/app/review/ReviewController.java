package com.fieldops.app.review;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Customer ratings of completed visits; the owner chooses which comments the public page shows. */
@RestController
@RequestMapping("/api/v1/reviews")
public class ReviewController {

    private final ReviewService reviews;

    public ReviewController(ReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER', 'COORDINATOR')")
    public List<ReviewRow> list() {
        return reviews.recent();
    }

    @PutMapping("/{id}/published")
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<Void> publish(@PathVariable UUID id, @RequestBody PublishRequest req) {
        reviews.setPublished(id, req.published());
        return ResponseEntity.noContent().build();
    }

    public record PublishRequest(boolean published) {
    }
}
