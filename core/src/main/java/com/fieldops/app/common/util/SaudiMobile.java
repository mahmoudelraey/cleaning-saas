package com.fieldops.app.common.util;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

/** Bean Validation constraint: value must normalize to a Saudi mobile number. Null is valid (use @NotBlank). */
@Documented
@Constraint(validatedBy = SaudiMobile.Validator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface SaudiMobile {

    String message() default "invalid_phone";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<SaudiMobile, String> {
        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value == null || PhoneNumbers.normalizeSaudiMobile(value).isPresent();
        }
    }
}
