-- English text of an invoice/quote line, printed under the Arabic on the bilingual PDF. Snapshotted when the
-- line is created (like the Arabic one), so an issued invoice never changes if a service is renamed later.
ALTER TABLE document_lines ADD COLUMN description_en VARCHAR(300);
