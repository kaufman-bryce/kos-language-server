import { IArgumentType } from './types';
import { createStructureType, createSuffixType } from './ksType';
import { addPrototype, addSuffixes } from '../typeUitlities';
import { structureType } from './primitives/structure';
import { vectorType } from './collections/vector';

export const orbitableVelocityType: IArgumentType = createStructureType('orbitableVelocity');
addPrototype(orbitableVelocityType, structureType);

addSuffixes(
  orbitableVelocityType,
  createSuffixType('obt', vectorType),
  createSuffixType('orbit', vectorType),
  createSuffixType('surface', vectorType),
);