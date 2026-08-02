ALTER TABLE "room_rounds" ADD COLUMN "winner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "room_rounds" ADD COLUMN "finish_reason" varchar(32);--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "is_matchmade" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "winner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "finish_reason" varchar(32);--> statement-breakpoint
ALTER TABLE "room_rounds" ADD CONSTRAINT "room_rounds_winner_user_id_users_id_fk" FOREIGN KEY ("winner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_winner_user_id_users_id_fk" FOREIGN KEY ("winner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;