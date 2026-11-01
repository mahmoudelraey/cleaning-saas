package com.fieldops.app.common.storage;

import java.net.URI;
import java.nio.file.Path;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/**
 * {@code app.storage.type=local} (default) stores under {@code app.storage.local-dir};
 * {@code app.storage.type=s3} uses an S3-compatible endpoint (path-style, works with MinIO).
 */
@Configuration
public class StorageConfig {

    @Bean
    @ConditionalOnProperty(name = "app.storage.type", havingValue = "local", matchIfMissing = true)
    FileStorage localFileStorage(@Value("${app.storage.local-dir:./data/uploads}") String dir) {
        return new LocalFileStorage(Path.of(dir));
    }

    @Bean
    @ConditionalOnProperty(name = "app.storage.type", havingValue = "s3")
    FileStorage s3FileStorage(@Value("${app.storage.s3.endpoint:}") String endpoint,
                              @Value("${app.storage.s3.region:me-central-1}") String region,
                              @Value("${app.storage.s3.bucket}") String bucket,
                              @Value("${app.storage.s3.access-key}") String accessKey,
                              @Value("${app.storage.s3.secret-key}") String secretKey) {
        var builder = S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build());
        if (endpoint != null && !endpoint.isBlank()) {
            builder.endpointOverride(URI.create(endpoint));
        }
        return new S3FileStorage(builder.build(), bucket);
    }
}
