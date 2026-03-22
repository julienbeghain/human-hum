CREATE SCHEMA "listen";
--> statement-breakpoint
CREATE TYPE "listen"."source" AS ENUM('lastfm', 'spotify', 'tidal');--> statement-breakpoint
CREATE TABLE "listen"."albums" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listen"."albums_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"mbid" varchar(36),
	"artist_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "listen"."artists" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listen"."artists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"mbid" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "listen"."scrobbles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listen"."scrobbles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"track_id" integer NOT NULL,
	"listened_at" timestamp with time zone NOT NULL,
	"source" "listen"."source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "listen"."tracks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listen"."tracks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"mbid" varchar(36),
	"artist_id" integer NOT NULL,
	"album_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "listen"."albums" ADD CONSTRAINT "albums_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "listen"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen"."scrobbles" ADD CONSTRAINT "scrobbles_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "listen"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen"."tracks" ADD CONSTRAINT "tracks_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "listen"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen"."tracks" ADD CONSTRAINT "tracks_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "listen"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "albums_name_artist_id_mbid_idx" ON "listen"."albums" USING btree ("name","artist_id","mbid");--> statement-breakpoint
CREATE INDEX "albums_artist_id_idx" ON "listen"."albums" USING btree ("artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artists_name_mbid_idx" ON "listen"."artists" USING btree ("name","mbid");--> statement-breakpoint
CREATE UNIQUE INDEX "scrobbles_track_id_listened_at_idx" ON "listen"."scrobbles" USING btree ("track_id","listened_at");--> statement-breakpoint
CREATE INDEX "scrobbles_listened_at_idx" ON "listen"."scrobbles" USING btree ("listened_at");--> statement-breakpoint
CREATE INDEX "scrobbles_source_idx" ON "listen"."scrobbles" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_name_artist_id_mbid_idx" ON "listen"."tracks" USING btree ("name","artist_id","mbid");--> statement-breakpoint
CREATE INDEX "tracks_artist_id_idx" ON "listen"."tracks" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "tracks_album_id_idx" ON "listen"."tracks" USING btree ("album_id");