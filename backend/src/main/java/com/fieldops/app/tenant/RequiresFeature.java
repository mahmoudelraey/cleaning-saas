package com.fieldops.app.tenant;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Put on a controller class or method: the request is refused with 403 {@code feature_not_in_plan}
 * unless the company's plan includes the feature (a {@link PlanFeature} key). Method wins over class.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresFeature {
    String value();
}
