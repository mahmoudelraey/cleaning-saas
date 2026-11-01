package com.fieldops.portal.web;

import com.fieldops.portal.admin.AdminApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** problem+json with a {@code code}, like the admin API, so the frontend handles both the same way. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ProblemDetail api(ApiException ex) {
        return problem(ex.getStatus(), ex.getCode(), ex.getMessage());
    }

    /** Business errors from the admin backend (slot taken, too late to cancel…) pass through unchanged. */
    @ExceptionHandler(AdminApiException.class)
    ResponseEntity<String> admin(AdminApiException ex) {
        if (ex.getStatus().is5xxServerError()) {
            log.error("Admin backend error {}: {}", ex.getStatus(), ex.getBody());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                    .body("{\"title\":\"Bad Gateway\",\"status\":502,\"code\":\"upstream_error\"}");
        }
        return ResponseEntity.status(ex.getStatus()).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(ex.getBody());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail validation(MethodArgumentNotValidException ex) {
        return problem(HttpStatus.BAD_REQUEST, "validation_error", "Some fields are invalid");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(status, detail);
        p.setProperty("code", code);
        return p;
    }
}
