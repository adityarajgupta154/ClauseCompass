import { useMemo, useState } from "react";
import { ArrowRight, Download, Printer } from "lucide-react";
import { AnalysisScreen, focusRing } from "@/features/analysis/analysis-screen";
import { HelpLink } from "@/features/resources/help-link";
import { documentToAnalyse } from "@/features/analysis/select-document";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import type { StageId } from "@/features/journey/stages";
import { buildPacket, type Packet } from "@/features/packet/build-packet";
import { PacketDocument } from "@/features/packet/packet-document";
import { renderPacketText } from "@/features/packet/render-text";
import { usePacket, type PacketData } from "@/features/packet/use-packet";

/**
 * The Preparation Packet screen (PRD §5 step 7; FR-09): the map and the
 * review prompts of the analysed document folded into one printable sheet,
 * with the boundary statement on the sheet itself. Printing (and "save as
 * PDF" in the print dialog) is the browser's; the screen hides its own
 * chrome in print so only the sheet comes out. The text download is the
 * same content for readers who cannot print or would rather have a file.
 */
export default function PacketPage() {
  const { stage, documents, session } = useJourney();
  if (stage === null || session === null) return null;
  const file = documentToAnalyse(stage, documents);
  if (file === null) return null;
  return <PacketScreen file={file} stage={stage} sessionId={session.id} />;
}

function PacketScreen({ file, stage, sessionId }: { file: File; stage: StageId; sessionId: string }) {
  const state = usePacket(sessionId);
  const words = copy.packet;
  const back =
    stage === "compare-versions"
      ? { href: "/compare", label: words.backToCompare, testId: "link-back-to-compare" }
      : { href: "/review", label: words.back, testId: "link-back-to-review" };
  return (
    <AnalysisScreen
      files={[file]}
      state={state}
      summaries={(data) => [data.map.document]}
      words={{ heading: words.heading, lead: words.lead, status: words.status, errors: words.errors }}
      back={back}
      printsBodyOnly
    >
      {(data) => <PacketBody data={data} file={file} stage={stage} />}
    </AnalysisScreen>
  );
}

function PacketBody({ data, file, stage }: { data: PacketData; file: File; stage: StageId }) {
  const [preparedAt] = useState(() => new Date());
  const packet = useMemo(
    () => buildPacket({ stage, fileName: file.name, map: data.map, review: data.review, preparedAt }),
    [stage, file.name, data.map, data.review, preparedAt],
  );
  return (
    <div className="space-y-10 print:space-y-0">
      <PacketActions packet={packet} documentName={file.name} />
      {/* A desk under the sheet on screen only; on paper the sheet is the page. */}
      <div className="rounded-3xl border border-border/80 bg-muted/10 p-4 shadow-inner md:p-8 print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none">
        <PacketDocument packet={packet} />
      </div>
      {/* Where the bypass link above the packet lands: the controls after it start here. */}
      <p id="packet-end" tabIndex={-1} className="sr-only print:hidden" data-testid="text-packet-end">
        {copy.packet.actions.end}
      </p>
      {/* The journey's last step (PRD §5 step 8): from the packet to the services that can take the conversation further. */}
      <div className="flex justify-end pt-12 mt-12 border-t-[6px] border-border/40 print:hidden">
        <HelpLink
          testId="link-packet-official-help"
          className={`inline-flex min-h-[64px] items-center gap-3 rounded-2xl bg-primary px-8 text-xl font-semibold text-primary-foreground transition-colors hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 ${focusRing}`}
        >
          {copy.resources.entry.packet}
          <ArrowRight className="h-6 w-6" aria-hidden="true" />
        </HelpLink>
      </div>
    </div>
  );
}

function PacketActions({ packet, documentName }: { packet: Packet; documentName: string }) {
  const words = copy.packet.actions;
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 print:hidden" data-testid="packet-actions">
      <div className="flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={() => window.print()}
          className={`inline-flex min-h-[56px] items-center gap-3 rounded-2xl bg-primary px-8 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 hover:shadow-md ${focusRing}`}
          data-testid="button-print-packet"
        >
          <Printer aria-hidden="true" className="h-6 w-6" />
          {words.print}
        </button>
        <button
          type="button"
          onClick={() => downloadText(renderPacketText(packet), words.fileName(documentName.replace(/\.[^.]+$/, "")))}
          className={`inline-flex min-h-[56px] items-center gap-3 rounded-2xl border-2 border-primary/20 bg-primary/[0.03] px-8 text-lg font-semibold text-primary transition-colors hover:bg-primary/10 hover:border-primary/40 hover:shadow-sm ${focusRing}`}
          data-testid="button-download-packet-text"
        >
          <Download aria-hidden="true" className="h-6 w-6" />
          {words.download}
        </button>
      </div>
      <p className="text-base text-muted-foreground">{words.printHint}</p>
      {/* The packet carries a reference link on nearly every line; this is the keyboard's way past them all (visible only while focused). */}
      <a
        href="#packet-end"
        data-testid="link-skip-packet"
        className={`sr-only focus:not-sr-only focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-md focus:bg-primary focus:px-4 focus:font-medium focus:text-primary-foreground ${focusRing}`}
      >
        {words.skipPast}
      </a>
    </div>
  );
}

/** Hands the browser a file to save; nothing leaves the page. */
function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}