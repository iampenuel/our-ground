import {adultHelpDemoPath, escapeAttribute} from './age-page.ts';

type Example = {
  action: string;
  name: string;
  summary: string;
  details: string;
};

const categories = [
  {
    action: 'find-food',
    name: 'Food',
    title: 'Food resources',
    examples: [
      {
        action: 'resource-food',
        name: 'Sample food pantry',
        summary: 'Groceries and pantry staples for a household.',
        details: 'This example listing shows a weekly pickup of shelf-stable groceries. An adult could use the listing to compare the hours and pickup requirements of a pantry.',
      },
      {
        action: 'resource-food-pickup',
        name: 'Sample produce pickup',
        summary: 'Seasonal fruit and vegetables at a neighborhood pickup.',
        details: 'This example listing shows how a directory could describe a weekly produce pickup, what is available, and whether visitors should bring a bag.',
      },
    ],
  },
  {
    action: 'find-health',
    name: 'Healthcare',
    title: 'Healthcare resources',
    examples: [
      {
        action: 'resource-health',
        name: 'Sample community clinic',
        summary: 'A community clinic with primary care visits.',
        details: 'This example listing shows how a clinic could explain available services, appointment requirements, and payment options.',
      },
      {
        action: 'resource-health-wellness',
        name: 'Sample wellness program',
        summary: 'A drop-in program with general wellness information.',
        details: 'This example listing shows how a program could describe its activities, accessibility, and drop-in hours.',
      },
    ],
  },
  {
    action: 'find-community',
    name: 'Community support',
    title: 'Community support resources',
    examples: [
      {
        action: 'resource-community',
        name: 'Sample community closet',
        summary: 'Clothing and household essentials.',
        details: 'This example listing shows how a directory could describe the types of items available and the hours for collecting them.',
      },
      {
        action: 'resource-community-navigation',
        name: 'Sample resource desk',
        summary: 'Help finding local programs and understanding how to apply.',
        details: 'This example listing shows how a resource desk could describe its languages, hours, and the types of help available.',
      },
    ],
  },
];

const opportunities = [
  {
    action: 'opportunity-food',
    name: 'Pack a pantry box',
    summary: 'Sort groceries and assemble boxes for pickup.',
    details: 'This example shows a group volunteer shift sorting pantry staples and packing boxes. A real listing could include the shift length, training, and accessibility information.',
  },
  {
    action: 'opportunity-community',
    name: 'Assemble an essentials kit',
    summary: 'Put together kits with basic household supplies.',
    details: 'This example shows how a neighborhood group could describe the items it needs and what volunteers would do during a kit assembly shift.',
  },
];

export function demoLinks(...choices: [action: string, label: string][]) {
  const links = choices.map(([action, label]) => {
    const href = action === '/' ? '/' : adultHelpDemoPath + '/' + action;
    return '<a href="' + escapeAttribute(href) + '">' + escapeAttribute(label) + '</a>';
  });
  return '<div class="demo-actions">' + links.join('') + '</div>';
}

function cards(examples: Example[]) {
  return examples.map(example => '<article class="demo-card"><h2>' + example.name + '</h2><p>' + example.summary +
    '</p>' + demoLinks([example.action, 'View ' + example.name]) + '</article>').join('');
}

export function previewScene(action: string): {title: string; body: string} | undefined {
  if (action === 'find') return {
    title: 'Find Support',
    body: '<p class="demo-note">Choose a category to browse fictional resources.</p>' +
      demoLinks(...categories.map(({action, name}): [string, string] => [action, name])) +
      demoLinks(['success', 'Back to assistance preview']),
  };
  if (action === 'give') return {
    title: 'Give Support',
    body: '<p class="demo-note">Browse fictional ways to help.</p>' + cards(opportunities) +
      demoLinks(['success', 'Back to assistance preview']),
  };

  for (const category of categories) {
    if (action === category.action) return {
      title: category.title,
      body: '<p class="demo-note">Fictional sample resources</p>' + cards(category.examples) +
        demoLinks(['find', 'Back to categories']),
    };
    const resource = category.examples.find(example => example.action === action);
    if (resource) return {
      title: resource.name,
      body: '<p class="demo-note">Fictional resource</p><p>' + resource.details + '</p>' +
        demoLinks([category.action, 'Back to results']),
    };
  }

  const opportunity = opportunities.find(example => example.action === action);
  if (opportunity) return {
    title: opportunity.name,
    body: '<p class="demo-note">Fictional opportunity</p><p>' + opportunity.details + '</p>' +
      demoLinks(['give', 'Back to opportunities']),
  };
}
