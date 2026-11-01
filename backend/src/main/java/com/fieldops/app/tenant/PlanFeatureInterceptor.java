package com.fieldops.app.tenant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import com.fieldops.app.common.tenant.TenantContext;

/** Enforces {@link RequiresFeature}. Errors go through the normal problem+json handler. */
@Component
public class PlanFeatureInterceptor implements HandlerInterceptor {

    private final PlanFeatureService features;

    public PlanFeatureInterceptor(PlanFeatureService features) {
        this.features = features;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod hm) || TenantContext.current().isEmpty()) {
            return true;
        }
        RequiresFeature rule = AnnotatedElementUtils.findMergedAnnotation(hm.getMethod(), RequiresFeature.class);
        if (rule == null) {
            rule = AnnotatedElementUtils.findMergedAnnotation(hm.getBeanType(), RequiresFeature.class);
        }
        if (rule != null) {
            features.require(rule.value());
        }
        return true;
    }
}
