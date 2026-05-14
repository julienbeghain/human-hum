CREATE TABLE "listen"."album_tracks" (
	"album_id" integer NOT NULL,
	"track_number" integer NOT NULL,
	"name" text NOT NULL,
	"track_id" integer,
	"duration" integer,
	CONSTRAINT "album_tracks_album_id_track_number_pk" PRIMARY KEY("album_id","track_number")
);
--> statement-breakpoint
ALTER TABLE "listen"."albums" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "listen"."albums" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listen"."album_tracks" ADD CONSTRAINT "album_tracks_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "listen"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen"."album_tracks" ADD CONSTRAINT "album_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "listen"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "album_tracks_track_id_idx" ON "listen"."album_tracks" USING btree ("track_id");