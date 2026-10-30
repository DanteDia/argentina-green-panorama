import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CvItem, Program } from "../types";
import { CV_KINDS } from "../cv";

export type Template = "editorial" | "minimal";
export interface PdfWork { title: string; year: string | null; technique: string | null; dimensions: string | null; src: Buffer | null }
export interface PdfData { name: string; city: string | null; contact: string; program: Program; letter: string; bio: string; statement: string; cv: CvItem[]; works: PdfWork[]; template: Template; worksPerPage: 1 | 2 }

const INK = "#1c1b18", MUTED = "#76746c";

const styles = (t: Template) => {
  const serif = t === "editorial";
  return StyleSheet.create({
    page: { padding: 56, fontFamily: serif ? "Times-Roman" : "Helvetica", fontSize: 10.5, lineHeight: 1.5, color: INK, backgroundColor: serif ? "#fbfaf6" : "#ffffff" },
    eyebrow: { fontFamily: "Helvetica", fontSize: 7.5, letterSpacing: 1.6, textTransform: "uppercase", color: MUTED },
    h1: { fontFamily: serif ? "Times-Roman" : "Helvetica-Bold", fontSize: serif ? 40 : 28, lineHeight: 1.1, marginTop: 10 },
    h2: { fontFamily: serif ? "Times-Roman" : "Helvetica-Bold", fontSize: serif ? 20 : 14, marginBottom: 12 },
    para: { marginBottom: 9 },
    muted: { color: MUTED },
    caption: { fontSize: 8.5, marginTop: 6, color: MUTED },
    footer: { position: "absolute", bottom: 28, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", fontFamily: "Helvetica", fontSize: 7, color: MUTED },
  });
};

const paras = (s: string, st: ReturnType<typeof styles>) => s.split(/\n{2,}/).filter((p) => p.trim()).map((p, i) => <Text key={i} style={st.para}>{p.trim()}</Text>);

export function DossierDocument(d: PdfData) {
  const st = styles(d.template);
  const footer = <View style={st.footer} fixed><Text>{d.name} · {d.program.name}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>;
  const grupos = CV_KINDS.map(([k, l]) => [l, d.cv.filter((c) => c.kind === k)] as const).filter(([, xs]) => xs.length);
  const pages: PdfWork[][] = [];
  for (let i = 0; i < d.works.length; i += d.worksPerPage) pages.push(d.works.slice(i, i + d.worksPerPage));

  return (
    <Document title={`${d.name} - ${d.program.name}`} author={d.name}>
      <Page size="A4" style={st.page}>
        <Text style={st.eyebrow}>Postulación a {d.program.name}</Text>
        <Text style={st.h1}>{d.name}</Text>
        <Text style={[st.muted, { marginTop: 6 }]}>{[d.city, d.contact].filter(Boolean).join(" · ")}</Text>
        {d.letter ? <View style={{ marginTop: 36 }}>{paras(d.letter, st)}</View> : null}
        {footer}
      </Page>
      {(d.statement || d.bio) && (
        <Page size="A4" style={st.page}>
          {d.statement ? <View><Text style={st.h2}>Statement</Text>{paras(d.statement, st)}</View> : null}
          {d.bio ? <View style={{ marginTop: 20 }}><Text style={st.h2}>Biografía</Text>{paras(d.bio, st)}</View> : null}
          {footer}
        </Page>
      )}
      {grupos.length > 0 && (
        <Page size="A4" style={st.page}>
          <Text style={st.h2}>CV</Text>
          {grupos.map(([l, xs]) => (
            <View key={l} style={{ marginBottom: 12 }} wrap={false}>
              <Text style={st.eyebrow}>{l}</Text>
              {xs.map((c) => <Text key={c.id} style={{ marginTop: 3 }}><Text style={st.muted}>{c.year ?? "—"}  </Text>{c.title}{c.org && c.org !== c.title ? `, ${c.org}` : ""}{c.city ? `, ${c.city}` : ""}</Text>)}
            </View>
          ))}
          {footer}
        </Page>
      )}
      {pages.map((ws, i) => (
        <Page key={i} size="A4" style={st.page}>
          {ws.map((w, j) => (
            <View key={j} style={{ flexGrow: 1, marginBottom: d.worksPerPage === 2 ? 16 : 0 }}>
              {w.src ? <Image src={w.src} style={{ objectFit: "contain", maxHeight: d.worksPerPage === 2 ? 320 : 640 }} /> : null}
              <Text style={st.caption}>{[w.title, w.year, w.technique, w.dimensions].filter(Boolean).join(", ")}</Text>
            </View>
          ))}
          {footer}
        </Page>
      ))}
    </Document>
  );
}
