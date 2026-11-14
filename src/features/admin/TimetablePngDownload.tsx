"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminSession } from "./data";

export function TimetablePngDownload({ session }: { session: AdminSession }) {
  function download() {
    const slots = [...new Set(session.courtSchedule.map((game) => game.startAt))].sort();
    const cellW = 250, cellH = 112, left = 130, top = 100;
    const width = left + cellW * slots.length + 30;
    const height = top + cellH * session.courtCount + 30;
    const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
    const rows = slots.map((slot, col) => `<text x="${left + col * cellW + 12}" y="76" font-size="18" font-weight="700">${esc(slot.slice(0, 5))}</text>`).join("");
    const cells = Array.from({ length: session.courtCount }, (_, row) => {
      const y = top + row * cellH;
      return `<text x="24" y="${y + 38}" font-size="17" font-weight="700">Court ${row + 1}</text>` + slots.map((slot, col) => {
        const x = left + col * cellW, game = session.courtSchedule.find((item) => item.startAt === slot && item.courtNumber === row + 1);
        const names = game?.players.map((player) => esc(player.displayName)) ?? [];
        return `<rect x="${x}" y="${y}" width="${cellW - 10}" height="${cellH - 10}" rx="12" fill="#f4f7fb" stroke="#d5deea"/>${names.map((name, index) => `<text x="${x + 14}" y="${y + 32 + index * 23}" font-size="15">${name}</text>`).join("")}`;
      }).join("");
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="24" y="34" font-size="22" font-weight="700">${esc(session.dayName)} · ${esc(session.date)}</text>${rows}${cells}</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob), image = new Image();
    image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = width * 2; canvas.height = height * 2; const context = canvas.getContext("2d"); if (context) { context.scale(2, 2); context.drawImage(image, 0, 0); canvas.toBlob((png) => { if (png) { const link = document.createElement("a"); link.href = URL.createObjectURL(png); link.download = `badminton-timetable-${session.date}.png`; link.click(); URL.revokeObjectURL(link.href); } URL.revokeObjectURL(url); }, "image/png"); } };
    image.src = url;
  }
  return <Button type="button" size="sm" variant="outline" onClick={download}><Download aria-hidden="true"/>PNG</Button>;
}
