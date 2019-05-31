import { ArgumentType } from './types';
import { createStructureType, createSuffixType } from "../typeCreators";
import { addPrototype, addSuffixes } from '../typeUitlities';
import { structureType } from './primitives/structure';
import { stringType } from './primitives/string';
import { scalarType } from './primitives/scalar';

export const craftTemplateType: ArgumentType = createStructureType('craftTemplate');
addPrototype(craftTemplateType, structureType);

addSuffixes(
  craftTemplateType,
  createSuffixType('name', stringType),
  createSuffixType('description', stringType),
  createSuffixType('editor', stringType),
  createSuffixType('launchSite', stringType),
  createSuffixType('mass', stringType),
  createSuffixType('cost', stringType),
  createSuffixType('partCount', scalarType),
);
