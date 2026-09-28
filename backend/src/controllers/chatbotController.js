const crypto = require("crypto");
const Incident = require("../models/Incident");
const Category = require("../models/Category");
const KnowledgeBaseArticle = require("../models/KnowledgeBaseArticle");
const permissions = require("../services/permissionService");
const { parseIntent } = require("../services/geminiService");
const { TERMINAL_STATUSES, KBA_STATUS } = require("../constants");
const { successResponse } = require("../utils/apiResponse");
const { createIncidentForReporter } = require("../services/incidentCreationService");

const conversations = new Map();
const TTL = 30 * 60 * 1000;
const clean = () => { const now = Date.now(); for (const [id, value] of conversations) if (value.expiresAt < now) conversations.delete(id); };
const mainMenu = () => ({ type: "menu", message: "How can I help you?", options: [{ id: "SHOW_INCIDENT_MENU", label: "Incidents" }, { id: "SHOW_INFORMATION_MENU", label: "Details / Information" }] });
const incidentMenu = () => ({ type: "menu", message: "Incidents", options: [{ id: "CREATE_INCIDENT", label: "Create Incident" }, { id: "LIST_MY_INCIDENTS", label: "My Incidents" }, { id: "CHECK_STATUS", label: "Check Incident Status" }, { id: "SEARCH_MY_INCIDENTS", label: "Search My Incidents" }, { id: "SHOW_MAIN_MENU", label: "Back to Main Menu" }] });
const informationMenu = () => ({ type: "menu", message: "Details / Information", options: [{ id: "GET_MY_PROFILE", label: "My Profile" }, { id: "LIST_MY_INCIDENTS", label: "My Incidents" }, { id: "SEARCH_KB", label: "Knowledge Base" }, { id: "SHOW_MAIN_MENU", label: "Back to Main Menu" }] });
const safeIncident = (x) => ({ id: x._id, incidentNumber: x.incidentNumber, title: x.title, description: x.description, status: x.status, priority: x.priority, category: x.category?.name || "Uncategorised", createdAt: x.createdAt, updatedAt: x.updatedAt, resolutionNote: x.resolutionNote || undefined });
const stateFor = (userId, conversationId) => { clean(); const id = conversationId || crypto.randomUUID(); const old = conversations.get(id); if (old && old.userId !== String(userId)) return { id, denied: true }; const state = old || { userId: String(userId), flow: null, step: null }; state.expiresAt = Date.now() + TTL; conversations.set(id, state); return { id, state }; };
const reply = (res, conversationId, data) => successResponse(res, 200, "Chatbot response", { conversationId, ...data });
const categoryChoices = async () => ({ type: "menu", message: "Please select a category.", options: (await Category.find({ isActive: true }).sort({ name: 1 }).select("name").lean()).map(c => ({ id: `CATEGORY:${c._id}`, label: c.name })) });

const listMine = async (req, res, id, parameters = {}) => {
  const filter = { reportedBy: req.user._id };
  if (parameters.status === "open") filter.status = { $nin: TERMINAL_STATUSES };
  const items = await Incident.find(filter).populate("category", "name").sort({ createdAt: -1 }).limit(20).lean();
  return reply(res, id, { type: "incident_list", message: items.length ? "Here are your incidents." : "You have no matching incidents.", items: items.map(safeIncident) });
};
const searchMine = async (req, res, id, query) => {
  const escaped = String(query).slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const items = await Incident.find({ reportedBy: req.user._id, $or: [{ title: { $regex: escaped, $options: "i" } }, { description: { $regex: escaped, $options: "i" } }, { incidentNumber: { $regex: escaped, $options: "i" } }] }).populate("category", "name").sort({ createdAt: -1 }).limit(20).lean();
  return reply(res, id, { type: "incident_list", message: items.length ? "Here are your matching incidents." : "You have no matching incidents.", items: items.map(safeIncident) });
};
const getIncident = async (req, res, id, identifier) => {
  const query = String(identifier || "").startsWith("INC-") ? { incidentNumber: identifier } : { _id: identifier };
  let item; try { item = await Incident.findOne(query).populate("category", "name").lean(); } catch { item = null; }
  if (!item || !permissions.canView(req.user, item)) return reply(res, id, { type: "error", message: "I can't provide details for that incident." });
  return reply(res, id, { type: "incident_details", message: `Details for ${item.incidentNumber}.`, incident: safeIncident(item) });
};
const searchKb = async (req, res, id, query) => {
  let items; try { items = await KnowledgeBaseArticle.find({ status: KBA_STATUS.PUBLISHED, $text: { $search: String(query).slice(0, 200) } }, { score: { $meta: "textScore" } }).populate("categories", "name").sort({ score: { $meta: "textScore" } }).limit(8).lean(); } catch { items = []; }
  return reply(res, id, { type: "kb_results", message: items.length ? "Here are relevant published articles." : "I couldn't find published knowledge base articles for that.", items: items.map(a => ({ id: a._id, title: a.title, excerpt: a.body.slice(0, 280), categories: a.categories.map(c => c.name) })) });
};
const create = async (user, state) => {
  const category = await Category.findOne({ _id: state.categoryId, isActive: true });
  if (!category) return { type: "error", message: "That category is no longer available. Please select another category." };
  const description = state.description.trim();
  const title = description.replace(/\s+/g, " ").slice(0, 140).padEnd(5, ".");
  const incident = await createIncidentForReporter({ title, description, category: category._id, reporter: user });
  return { type: "message", message: `Incident ${incident.incidentNumber} was created successfully.`, incident: { id: incident._id, incidentNumber: incident.incidentNumber }, options: [{ id: `VIEW_INCIDENT:${incident._id}`, label: "View Incident" },{ id: "SHOW_MAIN_MENU", label: "Back to Main Menu" }] };
};

const message = async (req, res) => {
  const { action, message: text, conversationId } = req.body || {};
  const result = stateFor(req.user._id, conversationId);
  if (result.denied) return reply(res, result.id, { type: "error", message: "This conversation is not available." });
  const { id, state } = result; const value = String(action || text || "").trim();
  if (!value || value === "SHOW_MAIN_MENU") return reply(res, id, mainMenu());
  if (value === "SHOW_INCIDENT_MENU") return reply(res, id, incidentMenu());
  if (value === "SHOW_INFORMATION_MENU") return reply(res, id, informationMenu());
  if (value === "CREATE_INCIDENT") { state.flow = "CREATE_INCIDENT"; state.step = "CATEGORY"; return reply(res, id, await categoryChoices()); }
  if (value.startsWith("CATEGORY:") && state.flow === "CREATE_INCIDENT") { state.categoryId = value.slice(9); state.step = "DESCRIPTION"; return reply(res, id, { type: "message", message: "Please describe the issue." }); }
  if (value === "CANCEL" && state.flow) { state.flow = null; return reply(res, id, { type: "message", message: "Incident creation cancelled.", options: mainMenu().options }); }
  if (value === "CONFIRM_CREATE" && state.flow === "CREATE_INCIDENT" && state.step === "CONFIRM") { const data = await create(req.user, state); state.flow = null; return reply(res, id, data); }
  if (state.flow === "CREATE_INCIDENT" && state.step === "DESCRIPTION") { if (value.length < 10) return reply(res, id, { type: "error", message: "Please provide at least 10 characters describing the issue." }); state.description = value; state.step = "CONFIRM"; const category = await Category.findById(state.categoryId).select("name").lean(); return reply(res, id, { type: "confirmation", message: `Please confirm your incident:\n\nCategory: ${category?.name || "Selected category"}\nDescription: ${value}`, options: [{ id: "CONFIRM_CREATE", label: "Create Incident" }, { id: "CREATE_INCIDENT", label: "Edit" }, { id: "CANCEL", label: "Cancel" }] }); }
  if (value === "LIST_MY_INCIDENTS") return listMine(req, res, id);
  if (value === "GET_MY_PROFILE") return reply(res, id, { type: "message", message: "Here is your profile.", profile: { name: req.user.name, email: req.user.email, role: req.user.role } });
  if (value === "SEARCH_KB") { state.step = "KB"; return reply(res, id, { type: "message", message: "What would you like to search for in the Knowledge Base?" }); }
  if (value === "SEARCH_MY_INCIDENTS") { state.step = "INCIDENT_SEARCH"; return reply(res, id, { type: "message", message: "What would you like to search for in your incidents?" }); }
  if (value === "CHECK_STATUS") { state.step = "STATUS"; return reply(res, id, { type: "message", message: "Please enter the incident number, for example INC-123456." }); }
  if (value.startsWith("VIEW_INCIDENT:")) return getIncident(req, res, id, value.slice(14));
  if (state.step === "STATUS") return getIncident(req, res, id, value);
  if (state.step === "INCIDENT_SEARCH") return searchMine(req, res, id, value);
  const parsed = await parseIntent(value);
  if (!parsed) return reply(res, id, { type: "message", message: "Sorry, I couldn't understand that request right now. Please use one of the available options.", options: mainMenu().options });
  if (parsed.intent === "GREETING") return reply(res, id, { type: "menu", message: "Hi! How can I help you?", options: mainMenu().options });
  if (parsed.intent === "SHOW_MAIN_MENU") return reply(res, id, mainMenu());
  if (parsed.intent === "SHOW_INCIDENT_MENU") return reply(res, id, incidentMenu());
  if (parsed.intent === "SHOW_INFORMATION_MENU") return reply(res, id, informationMenu());
  if (parsed.intent === "LIST_MY_INCIDENTS") return listMine(req, res, id);
  if (parsed.intent === "SEARCH_MY_INCIDENTS") return searchMine(req, res, id, parsed.query || value);
  if (parsed.intent === "GET_MY_INCIDENT") {
    if (!parsed.incidentNumber) { state.step = "STATUS"; return reply(res, id, { type: "message", message: "Please enter the incident number, for example INC-123456." }); }
    return getIncident(req, res, id, parsed.incidentNumber);
  }
  if (parsed.intent === "CREATE_INCIDENT") { state.flow = "CREATE_INCIDENT"; state.step = "CATEGORY"; return reply(res, id, await categoryChoices()); }
  if (parsed.intent === "GET_MY_PROFILE") return reply(res, id, { type: "message", message: "Here is your profile.", profile: { name: req.user.name, email: req.user.email, role: req.user.role } });
  if (parsed.intent === "SEARCH_KB" || parsed.intent === "GET_KB_ARTICLE" || state.step === "KB") return searchKb(req, res, id, parsed.query || value);
  return reply(res, id, { type: "message", message: "Sorry, I couldn't understand that request right now. Please use one of the available options.", options: mainMenu().options });
};
module.exports = { message };
