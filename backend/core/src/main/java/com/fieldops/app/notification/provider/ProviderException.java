package com.fieldops.app.notification.provider;

import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

/** A send failed. {@link #isPermanent()} decides between trying the next provider now and retrying later. */
public class ProviderException extends RuntimeException {

    private final boolean permanent;

    public ProviderException(String message, boolean permanent, Throwable cause) {
        super(message, cause);
        this.permanent = permanent;
    }

    public boolean isPermanent() {
        return permanent;
    }

    /** 4xx (bad number, template not approved, wrong credentials) will not fix itself; 429 and 5xx may. */
    public static ProviderException of(String provider, RestClientResponseException e) {
        int status = e.getStatusCode().value();
        boolean permanent = status >= 400 && status < 500 && status != 429;
        return new ProviderException(provider + " " + status + ": " + e.getResponseBodyAsString(), permanent, e);
    }

    public static ProviderException unreachable(String provider, ResourceAccessException e) {
        return new ProviderException(provider + " unreachable: " + e.getMessage(), false, e);
    }

    public static ProviderException missingTemplate(String provider, String template) {
        return new ProviderException(provider + ": no template set for " + template, true, null);
    }
}
