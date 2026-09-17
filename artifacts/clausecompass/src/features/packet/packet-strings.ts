import type { Packet } from "./build-packet";

/**
 * Every reader-facing string of a packet, in reading order. The export
 * tests use it to prove that both renderings carry the whole model and
 * nothing is dropped between the model and the page.
 */
export function packetStrings(packet: Packet): string[] {
  const out: string[] = [packet.title, packet.subtitle, packet.notice, ...packet.about];
  for (const section of packet.sections) {
    out.push(section.heading, section.lead);
    for (const group of section.groups) {
      if (group.heading) out.push(group.heading);
      if (group.note) out.push(group.note);
      for (const item of group.items) {
        switch (item.kind) {
          case "statement":
          case "note":
            if (item.topic) out.push(item.topic);
            out.push(item.text);
            if (item.kind === "statement" && item.note) out.push(item.note);
            break;
          case "question":
            out.push(item.title, item.family, item.why, item.question);
            if (item.note) out.push(item.note);
            break;
          case "check":
            out.push(item.text);
            break;
          case "citation":
            out.push(item.location, item.text);
            break;
        }
      }
      if (group.footnote) out.push(group.footnote);
    }
    out.push(...section.notes);
  }
  out.push(packet.disclaimer.title, ...packet.disclaimer.points, packet.disclaimer.closing);
  return out;
}
