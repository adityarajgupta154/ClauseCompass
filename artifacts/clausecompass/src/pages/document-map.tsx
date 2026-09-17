import { useMemo } from "react";
import type { DocumentMapResponse } from "@workspace/api-client-react";
import { AnalysisScreen, ContinueLink } from "@/features/analysis/analysis-screen";
import { MapFieldSection } from "@/features/analysis/map-field-section";
import { documentToAnalyse } from "@/features/analysis/select-document";
import { Timeline } from "@/features/analysis/timeline";
import { useDocumentMap } from "@/features/analysis/use-document-map";
import { indexChunks, resolveClaim, type ChunkIndex } from "@/features/grounding/resolve-claim";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import { ReadAloudButton } from "@/features/speech/read-aloud-button";

/**
 * The Document Map and Timeline screen (PRD §5 step 4; FR-04, FR-05). The
 * map is prepared from the session's document when the screen opens;
 * RequireStage and RequireDocuments (in the router) guarantee the stage,
 * the files and the session are present.
 */
export default function DocumentMapPage() {
  const { stage, documents, session } = useJourney();
  if (stage === null || session === null) return null;
  const file = documentToAnalyse(stage, documents);
  if (file === null) return null;
  return <DocumentMapScreen file={file} sessionId={session.id} />;
}

function DocumentMapScreen({ file, sessionId }: { file: File; sessionId: string }) {
  const state = useDocumentMap(sessionId);
  const words = copy.map;
  const files = useMemo(() => [file], [file]);
  return (
    <AnalysisScreen
      files={files}
      state={state}
      summaries={(data) => [data.document]}
      words={words}
      back={{ href: "/interview", label: words.back, testId: "link-back-to-interview" }}
    >
      {(data) => (
        <>
          <MapBody data={data} />
          <ContinueLink href="/review" label={words.continueToReview} testId="link-continue-to-review" />
        </>
      )}
    </AnalysisScreen>
  );
}

function MapBody({ data }: { data: DocumentMapResponse }) {
  const chunks = useMemo(() => indexChunks(data.chunks), [data.chunks]);
  return (
    <div className="space-y-24">
      <div className="flex flex-wrap justify-end gap-3 pb-4 border-b border-border/60">
        <ReadAloudButton pieces={mapReading(data, chunks)} label={copy.readAloud.whole.map} testId="button-read-aloud-all" />
      </div>
      <div className="space-y-24">
        {data.map.fields.map((field) => (
          <MapFieldSection key={field.id} field={field} chunks={chunks} />
        ))}
      </div>
      <Timeline items={data.timeline.items} chunks={chunks} />
    </div>
  );
}

/**
 * The map as it is shown, for reading aloud: each point's title, then its
 * statements with their topics, or the "not found" line. Built from the same
 * resolution the cards use, so a statement the screen withholds is not read.
 */
export function mapReading(data: DocumentMapResponse, chunks: ChunkIndex): string[] {
  const words = copy.map;
  const pieces: string[] = [];
  for (const field of data.map.fields) {
    const section = words.fields[field.id];
    pieces.push(`${section.title}.`);
    if (field.status === "not-found") {
      pieces.push(`${words.notFound.title}. ${words.notFound.body(section.missing)}`);
      continue;
    }
    for (const claim of field.claims) {
      const resolved = resolveClaim(claim, chunks);
      if (resolved.status === "ungrounded") continue;
      const topic = words.topics[claim.category];
      pieces.push(topic ? `${topic}: ${resolved.claim.text}` : resolved.claim.text);
    }
  }
  return pieces;
}