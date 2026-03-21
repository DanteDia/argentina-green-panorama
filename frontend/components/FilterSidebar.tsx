"use client";

import { CLUSTER_COLORS, CLUSTER_LABELS_ES, CLUSTER_LABELS_EN, EDGE_COLORS, GreenNode } from "@/lib/types";
import ActivityFeed from "./ActivityFeed";

interface FilterSidebarProps {
  clusters: string[];
  selectedCluster: string | null;
  onClusterSelect: (cluster: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  nodeCount: number;
  edgeCount: number;
  verifiedCount: number;
  lang: "es" | "en";
  onLangToggle: () => void;
  onBatchVerify?: () => void;
  isBatchVerifying?: boolean;
  nodes?: GreenNode[];
  onSearchSelect?: (node: GreenNode) => void;
  activeEdgeTypes?: Set<string>;
  onToggleEdgeType?: (type: string) => void;
}

const EDGE_TYPE_LABELS = {
  es: { funds: "Fondea", partners_with: "Aliados", client_of: "Clientes", portfolio: "Portfolio", regulates: "Regula" },
  en: { funds: "Funds", partners_with: "Partners", client_of: "Clients", portfolio: "Portfolio", regulates: "Regulates" },
};

const t = {
  es: {
    title: "Green Panorama",
    subtitle: "Mapa del ecosistema verde argentino",
    search: "Buscar empresa o nodo...",
    clusters: "Clusters",
    all: "Todos",
    relationships: "Relaciones",
    stats: "Estadisticas",
    nodes: "Nodos",
    connections: "Conexiones",
    verified: "Verificados",
    poweredBy: "Verificado por GenLayer",
    agentStatus: "Agentes AI activos",
    verifyAll: "Verificar Nodos",
    verifying: "Verificando...",
  },
  en: {
    title: "Green Panorama",
    subtitle: "Argentina's green ecosystem map",
    search: "Search company or node...",
    clusters: "Clusters",
    all: "All",
    relationships: "Relationships",
    stats: "Statistics",
    nodes: "Nodes",
    connections: "Connections",
    verified: "Verified",
    poweredBy: "Verified by GenLayer",
    agentStatus: "AI Agents active",
    verifyAll: "Verify Nodes",
    verifying: "Verifying...",
  },
};

export default function FilterSidebar({
  clusters,
  selectedCluster,
  onClusterSelect,
  searchQuery,
  onSearchChange,
  nodeCount,
  edgeCount,
  verifiedCount,
  lang,
  onLangToggle,
  onBatchVerify,
  isBatchVerifying = false,
  nodes = [],
  onSearchSelect,
  activeEdgeTypes,
  onToggleEdgeType,
}: FilterSidebarProps) {
  const labels = t[lang];
  const clusterLabels = lang === "es" ? CLUSTER_LABELS_ES : CLUSTER_LABELS_EN;
  const edgeLabels = EDGE_TYPE_LABELS[lang];

  // Search autocomplete
  const searchResults = searchQuery.length >= 2
    ? nodes.filter((n) => {
        const q = searchQuery.toLowerCase();
        return n.nombre.toLowerCase().includes(q) ||
          n.descripcion?.toLowerCase().includes(q) ||
          n.categoria?.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  return (
    <div className="fixed left-0 top-0 h-full w-72 bg-zinc-900/90 backdrop-blur-md border-r border-zinc-700 z-40 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-green-400">{labels.title}</h1>
            <p className="text-xs text-zinc-400 mt-0.5">{labels.subtitle}</p>
          </div>
          <button
            onClick={onLangToggle}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition"
          >
            {lang === "es" ? "EN" : "ES"}
          </button>
        </div>
      </div>

      {/* Search with autocomplete */}
      <div className="p-4 relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={labels.search}
          className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition"
        />
        {searchResults.length > 0 && (
          <div className="absolute left-4 right-4 top-14 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl z-50 overflow-hidden">
            {searchResults.map((node) => (
              <button
                key={node.id}
                onClick={() => onSearchSelect?.(node)}
                className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition flex items-center gap-2 border-b border-zinc-700/50 last:border-0"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CLUSTER_COLORS[node.cluster] || "#6b7280" }}
                />
                <span className="flex-1 truncate">{node.nombre}</span>
                <span className="text-xs text-zinc-500">{node.cluster}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clusters */}
      <div className="px-4 pb-2">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          {labels.clusters}
        </h3>
        <div className="space-y-0.5">
          <button
            onClick={() => onClusterSelect(null)}
            className={`w-full text-left text-sm px-3 py-1 rounded transition ${
              !selectedCluster
                ? "bg-green-500/20 text-green-400"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            {labels.all}
          </button>
          {clusters.map((cluster) => (
            <button
              key={cluster}
              onClick={() =>
                onClusterSelect(selectedCluster === cluster ? null : cluster)
              }
              className={`w-full text-left text-sm px-3 py-1 rounded transition flex items-center gap-2 ${
                selectedCluster === cluster
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CLUSTER_COLORS[cluster] || "#6b7280" }}
              />
              {clusterLabels[cluster] || cluster}
            </button>
          ))}
        </div>
      </div>

      {/* Edge Type Legend / Filter */}
      {onToggleEdgeType && activeEdgeTypes && (
        <div className="px-4 py-2 border-t border-zinc-800">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            {labels.relationships}
          </h3>
          <div className="space-y-0.5">
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <button
                key={type}
                onClick={() => onToggleEdgeType(type)}
                className={`w-full text-left text-sm px-3 py-1 rounded transition flex items-center gap-2 ${
                  activeEdgeTypes.has(type)
                    ? "text-zinc-300"
                    : "text-zinc-600 line-through"
                }`}
              >
                <span
                  className="w-3 h-0.5 flex-shrink-0 rounded"
                  style={{
                    backgroundColor: activeEdgeTypes.has(type) ? color : "#4b5563",
                  }}
                />
                {edgeLabels[type as keyof typeof edgeLabels] || type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <ActivityFeed
        lang={lang}
        onNodeClick={(name) => {
          const node = nodes.find((n) => n.nombre === name);
          if (node) onSearchSelect?.(node);
        }}
      />

      {/* Stats */}
      <div className="mt-auto p-4 border-t border-zinc-700">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          {labels.stats}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-xl font-bold text-white">{nodeCount}</div>
            <div className="text-xs text-zinc-500">{labels.nodes}</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-white">{edgeCount}</div>
            <div className="text-xs text-zinc-500">{labels.connections}</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-400">{verifiedCount}</div>
            <div className="text-xs text-zinc-500">{labels.verified}</div>
          </div>
        </div>

        {onBatchVerify && (
          <button
            onClick={onBatchVerify}
            disabled={isBatchVerifying}
            className={`mt-3 w-full text-xs font-medium px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              isBatchVerifying
                ? "bg-amber-900/50 text-amber-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-500 text-white"
            }`}
          >
            {isBatchVerifying ? (
              <>
                <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                {labels.verifying}
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                {labels.verifyAll}
              </>
            )}
          </button>
        )}

        <div className="mt-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-zinc-400">{labels.agentStatus}</span>
        </div>

        <div className="mt-2 text-xs text-zinc-600">
          {labels.poweredBy}
        </div>
      </div>
    </div>
  );
}
