import type {ServiceCategory} from '../shared/contracts.ts';

/** Approved Our Ground category artwork, never an institution logo. Detail use only. */
const symbols={
 food:{path:'/assets/resource-symbols/our-ground-food-detail-symbol.png',width:1254,height:1254},
 healthcare:{path:'/assets/resource-symbols/our-ground-healthcare-detail-symbol.png',width:1536,height:1024}
} as const;
export function resourceSymbol(categories:readonly ServiceCategory[]):string {
 const category=categories.find(value=>value==='food'||value==='healthcare');
 if(!category)return '';
 const symbol=symbols[category];
 // The adjacent category label supplies the same meaning; this artwork is decorative.
 return '<span class="detail-category-symbol-slot" aria-hidden="true"><img class="detail-category-symbol detail-category-symbol--'+category+'" data-resource-symbol="'+category+'" src="'+symbol.path+'" width="'+symbol.width+'" height="'+symbol.height+'" alt="" aria-hidden="true" decoding="async" referrerpolicy="no-referrer" /></span>';
}
