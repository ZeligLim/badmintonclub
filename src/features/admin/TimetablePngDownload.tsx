"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration, formatTimeOfDay } from "@/lib/format";
import type { AdminSession } from "./data";

const COLORS = {
  background: "#faf9f4",
  foreground: "#263b32",
  muted: "#68796f",
  panel: "#f1f3ec",
  card: "#fffefa",
  border: "#dfe4d8",
  primary: "#416b52",
  primarySoft: "#e7efe6",
};

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[
      char
    ]!,
  );

export function TimetablePngDownload({ session }: { session: AdminSession }) {
  function download() {
    const slots = [...new Set(session.courtSchedule.map((game) => game.startAt))].sort();
    const courtWidth = 258;
    const courtGap = 14;
    const left = 112;
    const top = 142;
    const rowHeight = 220;
    const rowGap = 14;
    const width = left + slots.length * (courtWidth + courtGap) + 42;
    const height = top + session.courtCount * (rowHeight + rowGap) + 38;
    const date = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${session.date}T12:00:00Z`));

    const timeLabels = slots
      .map((slot, col) => {
        const x = left + col * (courtWidth + courtGap);
        return `<rect x="${x}" y="92" width="${courtWidth}" height="36" rx="18" fill="${COLORS.primarySoft}"/><text x="${x + courtWidth / 2}" y="116" text-anchor="middle" font-size="15" font-weight="700" fill="${COLORS.primary}">${escapeXml(formatTimeOfDay(slot))}</text>`;
      })
      .join("");

    const courtRows = Array.from({ length: session.courtCount }, (_, row) => {
      const y = top + row * (rowHeight + rowGap);
      const courtTitle = `<text x="28" y="${y + 27}" font-size="14" font-weight="700" fill="${COLORS.foreground}">COURT ${row + 1}</text>`;
      const games = slots
        .map((slot, col) => {
          const x = left + col * (courtWidth + courtGap);
          const game = session.courtSchedule.find(
            (item) => item.startAt === slot && item.courtNumber === row + 1,
          );
          const players = game?.players ?? [];
          const playerRows = players
            .map((player, index) => {
              const playerY = y + 58 + index * 37;
              return `<rect x="${x + 12}" y="${playerY}" width="${courtWidth - 24}" height="31" rx="8" fill="${COLORS.card}" stroke="${COLORS.border}"/><circle cx="${x + 27}" cy="${playerY + 15.5}" r="4" fill="${COLORS.primary}"/><text x="${x + 39}" y="${playerY + 20}" font-size="14" fill="${COLORS.foreground}">${escapeXml(player.displayName)}</text>`;
            })
            .join("");
          const emptyLabel =
            players.length === 0
              ? `<text x="${x + courtWidth / 2}" y="${y + 111}" text-anchor="middle" font-size="13" fill="${COLORS.muted}">No players assigned</text>`
              : "";
          return `<rect x="${x}" y="${y}" width="${courtWidth}" height="${rowHeight}" rx="14" fill="${COLORS.card}" stroke="${COLORS.border}"/><rect x="${x}" y="${y}" width="5" height="${rowHeight}" rx="2.5" fill="${COLORS.primary}"/>${playerRows}${emptyLabel}`;
        })
        .join("");
      return `${courtTitle}${games}`;
    }).join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Avenir Next, Avenir, Segoe UI, sans-serif"><rect width="100%" height="100%" fill="${COLORS.background}"/><text x="28" y="43" font-size="23" font-weight="700" fill="${COLORS.foreground}">${escapeXml(date)}</text><text x="28" y="69" font-size="13" fill="${COLORS.muted}">${escapeXml(formatTimeOfDay(session.startsAt))} · ${escapeXml(formatDuration(session.durationMinutes))} · ${session.courtCount} ${session.courtCount === 1 ? "court" : "courts"}</text>${timeLabels}${courtRows}</svg>`;
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");

      if (context) {
        context.scale(scale, scale);
        context.drawImage(image, 0, 0);
        canvas.toBlob((png) => {
          if (png) {
            const pngUrl = URL.createObjectURL(png);
            const link = document.createElement("a");
            link.href = pngUrl;
            link.download = `badminton-timetable-${session.date}.png`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
          }
          URL.revokeObjectURL(svgUrl);
        }, "image/png");
      } else {
        URL.revokeObjectURL(svgUrl);
      }
    };
    image.onerror = () => URL.revokeObjectURL(svgUrl);
    image.src = svgUrl;
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={download}>
      <Download aria-hidden="true" />
      PNG
    </Button>
  );
}
