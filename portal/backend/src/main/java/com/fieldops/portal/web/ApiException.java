package com.fieldops.portal.web;

import org.springframework.http.HttpStatus;

/** Error with a stable {@code code} the frontend translates (same convention as the admin API). */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static ApiException notFound(String entity) {
        return new ApiException(HttpStatus.NOT_FOUND, entity + "_not_found", entity + " not found");
    }

    public static ApiException forbidden(String code, String message) {
        return new ApiException(HttpStatus.FORBIDDEN, code, message);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
