package com.fieldops.app.google;

import java.util.List;
import java.util.Map;

import com.fieldops.app.common.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Google Places API (New). Used to find a company's Google Maps listing and to show its Google rating and
 * reviews on the public page.
 *
 * <p>Google's terms: only the Place ID may be stored; ratings and reviews are fetched live and never saved,
 * and wherever they are shown they must carry Google attribution (see the portal's Google reviews section).
 * Without {@code app.google.places-api-key} every call reports "not configured" and the feature stays hidden.
 */
@Component
public class GooglePlacesClient {

    private static final Logger log = LoggerFactory.getLogger(GooglePlacesClient.class);
    private static final String BASE = "https://places.googleapis.com/v1";
    /** Cheap fields only for search; reviews are requested only by {@link #details}. */
    private static final String SEARCH_FIELDS = "places.id,places.displayName,places.formattedAddress";
    private static final String DETAIL_FIELDS = "id,displayName,rating,userRatingCount,googleMapsUri,reviews";

    private final RestClient http;
    private final String apiKey;

    public GooglePlacesClient(RestClient.Builder builder, @Value("${app.google.places-api-key:}") String apiKey) {
        this.http = builder.baseUrl(BASE).build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    public boolean configured() {
        return !apiKey.isEmpty();
    }

    public record Candidate(String placeId, String name, String address) {
    }

    public record Author(String name, String uri, String photoUri) {
    }

    public record Review(int rating, String text, String textLanguage, boolean translated, String relativeTime,
                         String publishTime, Author author, String googleMapsUri, String flagUri) {
    }

    public record Details(String placeId, String name, Double rating, Integer count, String googleMapsUri,
                          List<Review> reviews) {
    }

    /** Businesses matching the text, biased to Saudi Arabia. */
    public List<Candidate> search(String text, String language) {
        requireConfigured();
        try {
            SearchResponse r = http.post().uri("/places:searchText")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Goog-Api-Key", apiKey)
                    .header("X-Goog-FieldMask", SEARCH_FIELDS)
                    .body(Map.of("textQuery", text, "languageCode", language, "regionCode", "SA", "pageSize", 8))
                    .retrieve()
                    .body(SearchResponse.class);
            if (r == null || r.places() == null) {
                return List.of();
            }
            return r.places().stream()
                    .map(p -> new Candidate(p.id(), p.displayName() == null ? null : p.displayName().text(),
                            p.formattedAddress()))
                    .toList();
        } catch (RestClientException e) {
            log.warn("Google Places search failed: {}", e.getMessage());
            throw unavailable();
        }
    }

    /** Rating, number of ratings and up to five reviews (chosen and ordered by Google). */
    public Details details(String placeId, String language) {
        requireConfigured();
        try {
            PlaceResponse p = http.get()
                    .uri(u -> u.path("/places/{id}").queryParam("languageCode", language).build(placeId))
                    .header("X-Goog-Api-Key", apiKey)
                    .header("X-Goog-FieldMask", DETAIL_FIELDS)
                    .retrieve()
                    .body(PlaceResponse.class);
            if (p == null) {
                throw unavailable();
            }
            List<Review> reviews = p.reviews() == null ? List.of() : p.reviews().stream().map(r -> {
                String text = r.text() == null ? null : r.text().text();
                String lang = r.text() == null ? null : r.text().languageCode();
                String origLang = r.originalText() == null ? null : r.originalText().languageCode();
                boolean translated = lang != null && origLang != null && !lang.equalsIgnoreCase(origLang);
                AuthorAttribution a = r.authorAttribution();
                return new Review(r.rating() == null ? 0 : r.rating(), text, lang, translated,
                        r.relativePublishTimeDescription(), r.publishTime(),
                        a == null ? null : new Author(a.displayName(), a.uri(), a.photoUri()),
                        r.googleMapsUri(), r.flagContentUri());
            }).toList();
            return new Details(p.id(), p.displayName() == null ? null : p.displayName().text(), p.rating(),
                    p.userRatingCount(), p.googleMapsUri(), reviews);
        } catch (RestClientException e) {
            log.warn("Google Places details failed for {}: {}", placeId, e.getMessage());
            throw unavailable();
        }
    }

    private void requireConfigured() {
        if (!configured()) {
            throw ApiException.notFound("google_places");
        }
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "google_unavailable",
                "Google Maps did not answer. Try again later.");
    }

    // --- Google's JSON (only the fields asked for in the field masks) ---

    public record LocalizedText(String text, String languageCode) {
    }

    public record SearchPlace(String id, LocalizedText displayName, String formattedAddress) {
    }

    public record SearchResponse(List<SearchPlace> places) {
    }

    public record AuthorAttribution(String displayName, String uri, String photoUri) {
    }

    public record PlaceReview(Integer rating, LocalizedText text, LocalizedText originalText,
                       String relativePublishTimeDescription, String publishTime, AuthorAttribution authorAttribution,
                       String googleMapsUri, String flagContentUri) {
    }

    public record PlaceResponse(String id, LocalizedText displayName, Double rating, Integer userRatingCount,
                         String googleMapsUri, List<PlaceReview> reviews) {
    }
}
