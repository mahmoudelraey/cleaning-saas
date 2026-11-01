package com.fieldops.portal.admin;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

import com.fieldops.portal.config.PortalProperties;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriUtils;

/** Calls the admin backend's {@code /internal/portal/{slug}/**} API with the shared secret. */
@Component
public class AdminClient {

    private static final String TOKEN_HEADER = "X-Internal-Token";

    private final RestClient http;

    public AdminClient(PortalProperties props) {
        String token = props.admin().internalToken();
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("app.admin.internal-token is not set (PORTAL_INTERNAL_TOKEN). "
                    + "Use the same value as the admin backend's app.portal.internal-token, or run with the 'local' profile.");
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(15));
        this.http = RestClient.builder()
                .baseUrl(props.admin().baseUrl())
                .requestFactory(factory)
                .defaultHeader(TOKEN_HEADER, token)
                .defaultStatusHandler(s -> s.isError(), (req, res) -> {
                    throw new AdminApiException(res.getStatusCode(),
                            StreamUtils.copyToString(res.getBody(), StandardCharsets.UTF_8));
                })
                .build();
    }

    public <T> T get(String slug, String path, Class<T> type) {
        return http.get().uri(url(slug, path)).retrieve().body(type);
    }

    public <T> T get(String slug, String path, ParameterizedTypeReference<T> type) {
        return http.get().uri(url(slug, path)).retrieve().body(type);
    }

    public <T> T post(String slug, String path, Object body, Class<T> type) {
        return http.post().uri(url(slug, path)).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(type);
    }

    public <T> T post(String slug, String path, Object body, ParameterizedTypeReference<T> type) {
        return http.post().uri(url(slug, path)).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(type);
    }

    public <T> T put(String slug, String path, Object body, Class<T> type) {
        return http.put().uri(url(slug, path)).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(type);
    }

    private static String url(String slug, String path) {
        return "/internal/portal/" + UriUtils.encodePathSegment(slug, StandardCharsets.UTF_8) + path;
    }
}
