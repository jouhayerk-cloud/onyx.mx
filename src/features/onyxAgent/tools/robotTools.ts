import { useDeviceControl } from '../../pico/useDeviceControl';
import { FaceExpression, EXPRESSIONS } from '../face/expressions';

export type AppRole = 'Developer' | 'Admin' | 'Vendor' | 'Client';

export interface RobotToolContext {
  role: AppRole;
  deviceId: string | null;
  online: boolean;
  control: Pick<ReturnType<typeof useDeviceControl>, 'say' | 'setFace' | 'move' | 'showVendorCard' | 'showInventoryCard'>;
}

export const robotToolDefinitions = [
  {
    name: 'robot_say',
    description: 'Speak text out loud using the robot. Use the robot only when the user asks or the answer is short. Never read secrets or personal data aloud.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Text to speak, max 240 chars' },
        language: { type: 'STRING', description: 'Language code: es, en, ja. Defaults to es' }
      },
      required: ['text']
    }
  },
  {
    name: 'robot_face',
    description: 'Change the robot face expression. Use the robot only when the user asks or the answer is short.',
    parameters: {
      type: 'OBJECT',
      properties: {
        expression: { type: 'STRING', description: 'Face expression: calm, happy, thinking, sleepy, shy, smug, pouty, alert, error, speaking, listening, vendor-display, inventory-display' },
        duration: { type: 'NUMBER', description: 'Duration in seconds (1 to 60, optional)' }
      },
      required: ['expression']
    }
  },
  {
    name: 'robot_move',
    description: 'Move the robot head (pan and tilt). Use the robot only when the user asks or the answer is short.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pan: { type: 'NUMBER', description: 'Pan angle in degrees (-90 to 90)' },
        tilt: { type: 'NUMBER', description: 'Tilt angle in degrees (0 to 90)' }
      },
      required: ['pan', 'tilt']
    }
  },
  {
    name: 'robot_show_vendor_card',
    description: 'Show a vendor card on the robot display. Use the robot only when the user asks or the answer is short.',
    parameters: {
      type: 'OBJECT',
      properties: {
        vendor: { type: 'STRING', description: 'Vendor identifier' },
        title: { type: 'STRING', description: 'Card title' },
        details: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Up to 4 detail lines, max 60 chars each' }
      },
      required: ['vendor', 'title', 'details']
    }
  },
  {
    name: 'robot_show_item_card',
    description: 'Show an item inventory card on the robot display. Use the robot only when the user asks or the answer is short.',
    parameters: {
      type: 'OBJECT',
      properties: {
        item_id: { type: 'STRING', description: 'Item ID' },
        title: { type: 'STRING', description: 'Item title' },
        price: { type: 'NUMBER', description: 'Optional item price' },
        stock: { type: 'NUMBER', description: 'Optional item stock' },
        vendor: { type: 'STRING', description: 'Optional vendor identifier' }
      },
      required: ['item_id', 'title']
    }
  }
];

export const robotToolRisk: Record<string, 'read' | 'navigate' | 'robot' | 'write'> = {
  robot_say: 'robot',
  robot_face: 'robot',
  robot_move: 'robot',
  robot_show_vendor_card: 'robot',
  robot_show_item_card: 'robot',
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
const sanitizeString = (str: string) => str.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

// One limit for ALL robot tools together (a model can call five different tools in one turn); module level so remounting cannot reset it.
let lastRobotCommandAt = 0;

export function createRobotToolHandlers(ctx: RobotToolContext): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {

  const checkAccess = (_toolName: string) => {
    if (ctx.role !== 'Developer' && ctx.role !== 'Admin') {
      return { ok: false, error: 'not allowed' };
    }
    if (!ctx.deviceId || !ctx.online) {
      return { ok: false, error: 'no robot online' };
    }
    const now = Date.now();
    if (now - lastRobotCommandAt < 1000) {
      return { ok: false, error: 'rate limited, wait one second and try again' };
    }
    lastRobotCommandAt = now;
    return null;
  };

  return {
    robot_say: async (args) => {
      const accessErr = checkAccess('robot_say');
      if (accessErr) return accessErr;
      
      const text = sanitizeString(String(args.text ?? '')).slice(0, 240);
      let language = String(args.language ?? 'es') as 'es' | 'en' | 'ja';
      if (language !== 'es' && language !== 'en' && language !== 'ja') {
        language = 'es';
      }
      
      ctx.control.say(text, language);
      return { ok: true, queued: true, device_id: ctx.deviceId };
    },
    robot_face: async (args) => {
      const accessErr = checkAccess('robot_face');
      if (accessErr) return accessErr;
      
      const expression = sanitizeString(String(args.expression ?? '')) as FaceExpression;
      if (!Object.prototype.hasOwnProperty.call(EXPRESSIONS, expression)) {
        return { ok: false, error: 'unknown expression' };
      }
      let duration: number | undefined = undefined;
      if (typeof args.duration === 'number') {
        duration = clamp(args.duration, 1, 60);
      }
      
      ctx.control.setFace(expression, duration);
      return { ok: true, queued: true, device_id: ctx.deviceId };
    },
    robot_move: async (args) => {
      const accessErr = checkAccess('robot_move');
      if (accessErr) return accessErr;
      
      const pan = clamp(Number(args.pan ?? 0), -90, 90);
      const tilt = clamp(Number(args.tilt ?? 0), 0, 90);
      
      ctx.control.move(pan, tilt);
      return { ok: true, queued: true, device_id: ctx.deviceId };
    },
    robot_show_vendor_card: async (args) => {
      const accessErr = checkAccess('robot_show_vendor_card');
      if (accessErr) return accessErr;
      
      const vendor = sanitizeString(String(args.vendor ?? '')).slice(0, 40);
      const title = sanitizeString(String(args.title ?? '')).slice(0, 60);
      let details: string[] = [];
      if (Array.isArray(args.details)) {
        details = args.details.map(d => sanitizeString(String(d)).slice(0, 60)).slice(0, 4);
      }
      
      ctx.control.showVendorCard(vendor, title, details);
      return { ok: true, queued: true, device_id: ctx.deviceId };
    },
    robot_show_item_card: async (args) => {
      const accessErr = checkAccess('robot_show_item_card');
      if (accessErr) return accessErr;
      
      const item_id = sanitizeString(String(args.item_id ?? '')).slice(0, 64);
      const title = sanitizeString(String(args.title ?? '')).slice(0, 60);
      const price = typeof args.price === 'number' && Number.isFinite(args.price) ? args.price : undefined;
      const stock = typeof args.stock === 'number' && Number.isFinite(args.stock) ? args.stock : undefined;
      const vendor = typeof args.vendor === 'string' ? sanitizeString(args.vendor).slice(0, 40) : undefined;
      
      ctx.control.showInventoryCard(item_id, title, price, stock, vendor);
      return { ok: true, queued: true, device_id: ctx.deviceId };
    }
  };
}
