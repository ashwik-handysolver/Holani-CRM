export type CallerType = 'Dealer' | 'Distributor' | 'Retailer' | 'End Customer' | 'Supplier' | 'Other';
export type Category =
  | 'New Order'
  | 'Price Inquiry'
  | 'Product Inquiry'
  | 'Complaint'
  | 'Service Request'
  | 'Payment'
  | 'Dealership Inquiry'
  | 'Follow-up'
  | 'Other';
export type Sentiment = 'Positive' | 'Neutral' | 'Negative';
export type Level = 'High' | 'Medium' | 'Low';
export type LeadQuality = 'Hot' | 'Warm' | 'Cold' | 'Not a lead';

export interface TranscriptLine {
  speaker: string;
  timestamp: string;
  text: string;
  english?: string;
}

export interface ActionItem {
  id: string;
  task: string;
  owner: 'Company' | 'Caller';
  dueDate: string | null;
  done: boolean;
}

export interface Product {
  name: string;
  quantity: string | null;
  notes: string | null;
}

export interface CallAnalysis {
  callerName: string | null;
  companyName: string | null;
  city: string | null;
  phone: string | null;
  callerType: CallerType;
  category: Category;
  language: string;
  summary: string;
  keyPoints: string[];
  products: Product[];
  orderValue: number | null;
  sentiment: Sentiment;
  priority: Level;
  leadQuality: LeadQuality;
  complaint: { issue: string; product: string | null; severity: Level } | null;
  transcript: TranscriptLine[];
}

export interface Call extends Omit<CallAnalysis, 'actionItems'> {
  id: string;
  fileName: string;
  fileSize: number;
  durationSec: number | null;
  callDate: string; // ISO date-time
  createdAt: string;
  actionItems: ActionItem[];
  notes: string;
  reviewed: boolean;
  customerId?: string;
  /** The recording's Google Drive file. When set, audio is streamed from Drive instead of stored in the browser. */
  driveFileId?: string;
  /** Uploaded as a new customer; saved, but waiting for the user to confirm the customer's details. */
  needsCustomer?: boolean;
}

export interface UploadOptions {
  languageCode?: string;
  customerId?: string;
  /** Analyse first, then ask the user to confirm a new customer from the results. */
  newCustomer?: boolean;
}

export type QueueStatus = 'queued' | 'processing' | 'done' | 'error';

/** A file in the Google Drive folder. */
export interface DriveRef {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export interface QueueItem {
  id: string;
  /** A recording chosen on this device (manual upload)… */
  file?: File;
  /** …or one that lives in Google Drive. */
  drive?: DriveRef;
  name: string;
  size: number | null;
  status: QueueStatus;
  error?: string;
  callId?: string;
  customerId?: string;
  newCustomer?: boolean;
}

export type View = 'dashboard' | 'calls' | 'upload' | 'followups' | 'customers' | 'products' | 'drive';

export interface Customer {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  city: string | null;
  type: CallerType;
  createdAt: string;
}
