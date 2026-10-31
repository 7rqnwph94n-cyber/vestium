Optional certificate artwork assets

Place custom seal files here to override vector fallback seals in PDF certificates:

- seal-passed.png (or .jpg)
- seal-not-passed.png (or .jpg)
- seal-attested.png (or .jpg)

Used by: apps/api/src/routes/certs.ts

If files are missing, the API uses built-in vector seals.
