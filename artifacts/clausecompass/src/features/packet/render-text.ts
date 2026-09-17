// The packet is prepared in English whatever language the screen shows (FR-09, FR-11), so it reads the English table, not the live `copy`.
import { en as copy } from "@/features/journey/copy";
import { formatReferences, type Packet, type PacketGroup, type PacketItem } from "./build-packet";

/**
 * The packet as a plain-text file (PRD §10, the text-only export): the same
 * content as the print view, laid out with underlined headings, indented
 * detail lines and the reference numbers in square brackets. UTF-8, no
 * markup, so it opens anywhere and reads aloud in order.
 */

const INDENT = "  ";

function underline(text: string, mark: string): string[] {
  return [text, mark.repeat(Math.min(text.length, 72))];
}

function withReferences(text: string, citations: readonly number[]): string {
  return citations.length > 0 ? `${text} ${formatReferences(citations)}` : text;
}

function indented(text: string, depth = 1): string[] {
  return text.split("\n").map((line) => `${INDENT.repeat(depth)}${line}`);
}

function itemLines(item: PacketItem): string[] {
  const words = copy.packet.document;
  switch (item.kind) {
    case "statement": {
      const lead = item.topic ? `${item.topic}: ` : "";
      return [`- ${lead}${withReferences(item.text, item.citations)}`, ...(item.note ? indented(item.note) : [])];
    }
    case "question": {
      const lines = [`* ${item.title} (${item.family})`, ...indented(item.why)];
      lines.push(...indented(item.withheld ? item.question : withReferences(item.question, item.citations)));
      if (item.places.length > 0) lines.push(...indented(`${words.placesLabel} ${formatReferences(item.places)}.`));
      if (item.note) lines.push(...indented(item.note));
      return lines;
    }
    case "check":
      return [`[ ] ${withReferences(item.text, item.citations)}`];
    case "citation":
      return [`${words.reference(item.number)} ${item.location}`, ...indented(item.text, 2)];
    case "note":
      return [`- ${item.topic ? `${item.topic}: ` : ""}${item.text}`];
  }
}

function groupLines(group: PacketGroup): string[] {
  const lines: string[] = [];
  if (group.heading) lines.push(...underline(group.heading, "-"));
  if (group.note) lines.push(group.note);
  if (group.heading || group.note) lines.push("");
  for (const item of group.items) lines.push(...itemLines(item), "");
  if (group.footnote) lines.push(group.footnote, "");
  return lines;
}

export function renderPacketText(packet: Packet): string {
  const lines: string[] = [
    ...underline(packet.title, "="),
    packet.subtitle,
    "",
    packet.notice,
    "",
    ...packet.about,
    "",
  ];
  for (const section of packet.sections) {
    lines.push("", ...underline(section.heading, "="), section.lead, "");
    for (const group of section.groups) lines.push(...groupLines(group));
    for (const note of section.notes) lines.push(note, "");
  }
  lines.push("", ...underline(packet.disclaimer.title, "="));
  for (const point of packet.disclaimer.points) lines.push(`- ${point}`);
  lines.push("", packet.disclaimer.closing, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
