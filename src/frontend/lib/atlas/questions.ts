/** Problem-oriented entry questions shown on Home and Explore (PRD 9.3, FR-008). */
export interface EntryQuestion {
  question: string;
  /** Entity id or journey id (prefixed "journey:"). */
  target: string;
}

export const ENTRY_QUESTIONS: EntryQuestion[] = [
  { question: "Should I use microservices?", target: "monolith-vs-microservices" },
  { question: "Do I need Kubernetes?", target: "should-you-adopt-kubernetes" },
  { question: "Which database should I choose?", target: "sql-vs-nosql" },
  { question: "Should I use Kafka?", target: "should-you-use-kafka" },
  { question: "How should I design for high availability?", target: "does-your-business-need-five-nines" },
  { question: "How can I reduce cloud infrastructure costs?", target: "journey:reduce-cloud-costs" },
];
