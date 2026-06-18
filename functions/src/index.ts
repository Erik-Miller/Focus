import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

export {
  startSession,
  stopSession,
  resumeSession,
  deleteSession,
} from "./callables/startSession.js";
export {
  ingestObservations,
  processObservations,
  synthesizePendingObservations,
} from "./callables/processObservations.js";
export { chatWithAgent, cancelChatRun } from "./callables/chatWithAgent.js";
export { generateReport } from "./callables/generateReport.js";
export {
  saveWorkflowForLater,
  deleteSavedWorkflow,
  recordSavedWorkflowLaunch,
} from "./callables/savedWorkflows.js";
