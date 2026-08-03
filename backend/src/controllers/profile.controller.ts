import type { Request, Response } from 'express';
import { sessionContext } from '../middleware/requireSession.js';
import { playerModel } from '../models/player.model.js';
import type { ProfileUpdate } from '../types/domain.js';
import { notFound, unprocessable } from '../utils/errors.js';

const MAX_NAME_LENGTH = 40;
const MAX_PRONOUNS_LENGTH = 40;

/**
 * Reads the fields a player is allowed to change, and only those.
 *
 * A key that is absent means "leave it alone"; a key that is present and null
 * means "clear it". Anything not listed here is ignored, so a client cannot
 * post its way into columns the game owns.
 */
function readPatch(body: unknown): ProfileUpdate {
  if (typeof body !== 'object' || body === null) {
    throw unprocessable('A JSON object is required');
  }

  const input = body as Record<string, unknown>;
  const patch: ProfileUpdate = {};

  if ('displayName' in input) {
    const value = input['displayName'];
    if (typeof value !== 'string' || !value.trim()) {
      throw unprocessable('displayName must be a non-empty string');
    }
    if (value.trim().length > MAX_NAME_LENGTH) {
      throw unprocessable(`displayName must be at most ${MAX_NAME_LENGTH} characters`);
    }
    patch.displayName = value.trim();
  }

  if ('pronouns' in input) {
    const value = input['pronouns'];
    if (value !== null && typeof value !== 'string') {
      throw unprocessable('pronouns must be a string or null');
    }
    if (typeof value === 'string' && value.length > MAX_PRONOUNS_LENGTH) {
      throw unprocessable(`pronouns must be at most ${MAX_PRONOUNS_LENGTH} characters`);
    }
    patch.pronouns = value === null || value.trim() === '' ? null : value.trim();
  }

  if ('locale' in input) {
    const value = input['locale'];
    // Deliberately loose: a BCP 47 tag, not a validated list of supported ones.
    if (typeof value !== 'string' || !/^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/.test(value)) {
      throw unprocessable('locale must be a language tag such as "en" or "en-GB"');
    }
    patch.locale = value;
  }

  if ('timeZone' in input) {
    const value = input['timeZone'];
    if (value !== null && typeof value !== 'string') {
      throw unprocessable('timeZone must be a string or null');
    }
    patch.timeZone = value === null || value.trim() === '' ? null : value.trim();
  }

  if ('preferences' in input) {
    const value = input['preferences'];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw unprocessable('preferences must be an object');
    }
    patch.preferences = value as Record<string, unknown>;
  }

  return patch;
}

export const profileController = {
  async current(req: Request, res: Response): Promise<void> {
    const { player } = sessionContext(req);
    res.json(player);
  },

  /** Partial update. Unlisted fields are left untouched. */
  async update(req: Request, res: Response): Promise<void> {
    const { player } = sessionContext(req);
    const patch = readPatch(req.body);

    const updated = await playerModel.updateProfile(player.id, patch);
    if (!updated) throw notFound('Player not found');

    res.json(updated);
  },
};
