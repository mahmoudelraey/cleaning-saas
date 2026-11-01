package com.fieldops.portal.admin;

import org.springframework.http.HttpStatusCode;

/** A non-2xx answer from the admin backend; the body is its problem+json (with {@code code}). */
public class AdminApiException extends RuntimeException {

    private final HttpStatusCode status;
    private final String body;

    public AdminApiException(HttpStatusCode status, String body) {
        super("Admin API " + status);
        this.status = status;
        this.body = body == null || body.isBlank()
                ? "{\"status\":" + status.value() + ",\"code\":\"upstream_error\"}" : body;
    }

    public HttpStatusCode getStatus() {
        return status;
    }

    public String getBody() {
        return body;
    }
}
