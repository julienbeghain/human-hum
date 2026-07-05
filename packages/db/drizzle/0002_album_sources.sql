CREATE TABLE "listen"."album_sources" (
	"album_id" integer NOT NULL,
	"source" "listen"."source" NOT NULL,
	"enriched_at" timestamp with time zone NOT NULL,
	"matched" boolean NOT NULL,
	CONSTRAINT "album_sources_album_id_source_pk" PRIMARY KEY("album_id","source")
);
--> statement-breakpoint
ALTER TABLE "listen"."album_sources" ADD CONSTRAINT "album_sources_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "listen"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Migrate marker columns into rows. LastFM was the enrichment driver, so a set
-- marker means it matched (matched = true). TIDAL was supplemental and never
-- recorded whether it matched; record matched = false — provenance is unaffected
-- (higher-priority LastFM owns it) and the TIDAL-primary flip clears these rows.
INSERT INTO "listen"."album_sources" ("album_id", "source", "enriched_at", "matched")
SELECT "id", 'lastfm', "lastfm_enriched_at", true
FROM "listen"."albums"
WHERE "lastfm_enriched_at" IS NOT NULL;--> statement-breakpoint
INSERT INTO "listen"."album_sources" ("album_id", "source", "enriched_at", "matched")
SELECT "id", 'tidal', "tidal_enriched_at", false
FROM "listen"."albums"
WHERE "tidal_enriched_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "listen"."albums" DROP COLUMN "lastfm_enriched_at";--> statement-breakpoint
ALTER TABLE "listen"."albums" DROP COLUMN "tidal_enriched_at";
