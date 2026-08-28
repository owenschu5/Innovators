export type SampleIdea = {
  category: string
  title: string
  description: string
  problem: string
  status: string
}

const categories: Array<{ category: string; ideas: Array<[string, string, string]> }> = [
  { category: 'Climate', ideas: [
    ['Neighborhood heat-map kiosks', 'Street-level displays that guide residents toward cooler walking routes during heat waves.', 'People need practical, block-by-block heat safety information.'],
    ['Apartment energy coach', 'A privacy-first tool that turns utility data into simple energy-saving experiments.', 'Renters rarely receive actionable feedback on energy use.'],
    ['Reusable takeout exchange', 'A deposit network that lets diners return reusable containers at any participating restaurant.', 'Single-use takeout packaging is convenient but wasteful.'],
    ['Rain garden matchmaker', 'A map that connects homeowners with nearby rain-garden designers and maintenance volunteers.', 'Stormwater projects are hard to discover and coordinate.'],
    ['Repair-first appliance guide', 'A local directory of repairability scores, parts availability, and trusted technicians.', 'Working appliances are discarded for lack of repair options.'],
    ['Community solar splitter', 'A cooperative model for sharing subscriptions to local solar projects among renters.', 'Many households cannot install solar where they live.'],
    ['Low-carbon event planner', 'A checklist and vendor marketplace for making neighborhood events lower-waste.', 'Small events lack simple sustainability planning tools.'],
    ['Compost pickup circles', 'Block-level compost collection groups with route planning and shared drop-off costs.', 'Households want composting options without a backyard.'],
    ['Flood-ready storefront kit', 'An affordable package of sensors, barriers, and alerts for small businesses in flood zones.', 'Independent shops have limited flood-preparedness resources.'],
    ['Second-life building materials map', 'A marketplace for reclaimed doors, fixtures, and surplus construction material.', 'Usable materials are sent to landfill when projects end.'],
  ] },
  { category: 'Health', ideas: [
    ['Care-plan translator', 'A plain-language companion that turns discharge instructions into daily checklists.', 'Medical instructions are often difficult to follow at home.'],
    ['Medication refill buddy', 'Opt-in reminders that let a trusted friend help catch missed refills.', 'Medication gaps can go unnoticed until they become urgent.'],
    ['Quiet hours finder', 'A map showing lower-sensory hours at local clinics, libraries, and shops.', 'People with sensory needs struggle to plan accessible visits.'],
    ['Community walking prescriptions', 'Clinics can refer patients to hosted neighborhood walks matched to mobility level.', 'Health advice is easier to sustain with social support.'],
    ['Caregiver shift board', 'A shared schedule that helps families coordinate meals, errands, and respite care.', 'Family caregivers juggle care duties through scattered messages.'],
    ['Therapy waitlist exchange', 'A secure service that fills cancelled appointment slots with eligible local patients.', 'Open care appointments go unused while waitlists grow.'],
    ['Food allergy restaurant notes', 'A structured way to share reliable preparation notes with restaurants before ordering.', 'Allergy diners need clearer communication than menu labels provide.'],
    ['Mobility equipment library', 'A lending library for walkers, shower chairs, and temporary recovery equipment.', 'Short-term equipment needs create unnecessary costs and waste.'],
    ['Sleep routine studio', 'Small peer groups test sleep habits and compare what works without sharing health records.', 'People need low-pressure ways to build better sleep routines.'],
    ['New-parent neighbor network', 'A local mutual-aid board for meal trains, baby gear, and short practical check-ins.', 'New parents often lack nearby support in the first months.'],
  ] },
  { category: 'Education', ideas: [
    ['Skill swap studio', 'Students trade short lessons in practical skills such as budgeting, design, and coding.', 'Useful peer knowledge is rarely visible across a campus.'],
    ['Local history field-kit', 'Teachers can borrow ready-made oral-history recording kits for neighborhood projects.', 'Schools need easy ways to connect learning with local stories.'],
    ['Homework clarity checker', 'A tool that rewrites assignment instructions into student-friendly steps.', 'Students lose time decoding ambiguous assignment language.'],
    ['Career shadow day exchange', 'A lightweight system for local professionals to host small groups for a half day.', 'Career exploration is unevenly available to young people.'],
    ['Library of failed prototypes', 'A public archive where makers document what did not work and why.', 'Teams repeat preventable mistakes because failures stay private.'],
    ['Study room pulse', 'Real-time availability and noise-level signals for shared study spaces.', 'Students waste time hunting for a usable place to focus.'],
    ['Language conversation walks', 'Scheduled paired walks that match learners with fluent community volunteers.', 'Language learners need low-stakes speaking practice.'],
    ['Micro-scholarship matcher', 'A service that matches students to small local grants they are likely to qualify for.', 'Many small scholarships go unclaimed.'],
    ['Science equipment share', 'Schools lend underused lab tools to each other through a shared calendar.', 'Expensive equipment sits idle while other classrooms go without.'],
    ['Teacher feedback bank', 'A searchable collection of constructive feedback phrases linked to common learning goals.', 'Writing individualized feedback is time-intensive for teachers.'],
  ] },
  { category: 'Mobility', ideas: [
    ['Safe-route after dark', 'A crowd-informed map that prioritizes lighting, open businesses, and transit timing.', 'Night travel decisions often lack practical safety context.'],
    ['School carpool pods', 'Verified neighborhood groups that coordinate rotating school drop-offs.', 'Families need safer, simpler alternatives to daily solo driving.'],
    ['Accessible curb map', 'Residents document curb cuts, slopes, and obstructions with photo updates.', 'Accessibility information is incomplete in standard maps.'],
    ['Bus stop comfort score', 'A public scorecard for shade, seating, lighting, and real-time information.', 'Transit riders lack visibility into stop quality.'],
    ['Delivery bike repair pop-ups', 'Mobile repair events that keep local delivery riders safely on the road.', 'Independent riders have limited time for maintenance.'],
    ['Event bike valet network', 'A reusable operating kit for secure bike parking at community events.', 'People avoid cycling when parking feels risky.'],
    ['Shared cargo trailer hub', 'Neighborhood hubs lend bike trailers for groceries, moving, and errands.', 'Car-free households lack access to occasional hauling capacity.'],
    ['Crosswalk request tracker', 'A transparent board for residents to follow safety requests from report to repair.', 'Street-safety reports often disappear into opaque systems.'],
    ['Rural ride-share bulletin', 'A scheduled ride board designed for small towns and recurring trips.', 'Rural residents face sparse transportation choices.'],
    ['Transit transfer coach', 'A tool that suggests less stressful transfers based on walking distance and reliability.', 'Fastest routes are not always the easiest routes to use.'],
  ] },
  { category: 'Civic Tech', ideas: [
    ['Plain-language budget explorer', 'An interactive city budget that shows trade-offs in everyday terms.', 'Residents struggle to understand how public money is allocated.'],
    ['Public meeting digest', 'Short, searchable summaries of local meetings with links to source video.', 'Civic meetings are difficult for most residents to follow.'],
    ['Permit progress tracker', 'A status tracker that explains each step of common small-business permits.', 'Permit processes feel opaque and unpredictable.'],
    ['Volunteer skills registry', 'A consent-based directory that helps local nonprofits find specific expertise.', 'Community groups cannot easily locate specialized volunteer help.'],
    ['Neighborhood issue triage', 'A shared board that groups duplicate reports and routes them to the right agency.', 'Residents submit the same issue through fragmented channels.'],
    ['Election question builder', 'A nonpartisan tool for residents to co-author questions for local candidates.', 'Voters need a clearer way to surface local priorities.'],
    ['Accessible document checker', 'A quick scan for public PDFs that flags common readability and accessibility issues.', 'Public information often excludes people using assistive technology.'],
    ['Community grant calendar', 'One calendar for small local grants, deadlines, workshops, and office hours.', 'Funding opportunities are scattered across many sites.'],
    ['Participatory map wall', 'A kiosk-friendly map for gathering place-based ideas during public workshops.', 'Not everyone can participate comfortably in online surveys.'],
    ['Policy impact diary', 'Residents record how a local policy affects daily life over time.', 'Decision-makers rarely see sustained lived experience data.'],
  ] },
  { category: 'Food', ideas: [
    ['Surplus produce subscription', 'A weekly box built from cosmetically imperfect produce from nearby growers.', 'Good food is wasted because it does not meet retail appearance standards.'],
    ['Community kitchen booking', 'A calendar and cost-sharing tool for licensed kitchens with unused hours.', 'Food entrepreneurs struggle to access affordable production space.'],
    ['Recipe rescue cards', 'Simple recipes generated from ingredients approaching their use-by dates.', 'Households throw away food when they lack an easy plan for it.'],
    ['School garden harvest exchange', 'Schools share excess garden harvest with cafeterias and neighborhood pantries.', 'Small harvests are difficult to distribute efficiently.'],
    ['Farm pickup coordination', 'Neighbors combine orders to make local farm pickup more practical.', 'Direct farm shopping can be hard for people with limited time.'],
    ['Allergen-safe potluck labels', 'Reusable, easy-to-read label kits for community meal events.', 'Potlucks make it hard to identify ingredients and allergens.'],
    ['Restaurant leftovers hotline', 'A same-day match service for safe, packaged restaurant surplus.', 'Edible prepared food is often discarded at closing time.'],
    ['Pantry staple price map', 'A community-maintained map of prices for a standard basket of essentials.', 'Families need clearer visibility into affordable grocery options.'],
    ['Neighborhood freezer share', 'A managed network of freezer space for mutual-aid meal storage.', 'Prepared meals cannot always be stored by the people who need them.'],
    ['Cultural recipe archive', 'Families record recipes, substitutions, and food stories for future generations.', 'Food traditions can be lost when they are not documented.'],
  ] },
  { category: 'Arts & Culture', ideas: [
    ['Open rehearsal calendar', 'A listing for public rehearsals and low-cost practice spaces across the city.', 'Emerging artists need affordable ways to find creative community.'],
    ['Neighborhood sound archive', 'Residents contribute short recordings that preserve the changing sound of a place.', 'Local soundscapes disappear without documentation.'],
    ['Pop-up gallery toolkit', 'A shared kit of lights, labels, and guidance for turning empty storefronts into exhibits.', 'Artists lack accessible exhibition space.'],
    ['Community mural maintenance fund', 'A small recurring fund for touch-ups and stewardship of public murals.', 'Public art often lacks a plan for long-term care.'],
    ['Borrowable stage kit', 'A lending library of microphones, risers, and basic lighting for local performances.', 'Small groups cannot justify buying event equipment.'],
    ['Artist skill barter', 'A platform for creatives to exchange services without cash changing hands.', 'Independent artists need flexible ways to access help.'],
    ['Museum memory prompts', 'Visitor-created prompts that connect exhibits to personal and neighborhood stories.', 'Museums can feel disconnected from everyday lived experience.'],
    ['Youth zine press', 'Mobile printing workshops that help young people publish short-run zines.', 'Youth voices need more approachable publishing outlets.'],
    ['Public piano caretaker map', 'A map for tuning, hosting, and caring for shared pianos in public places.', 'Community instruments need clear local stewardship.'],
    ['Festival accessibility buddy', 'Volunteer matches for attendees who want navigation or sensory support at festivals.', 'Large cultural events can be hard to navigate independently.'],
  ] },
  { category: 'Work & Economy', ideas: [
    ['Freelancer benefits circle', 'A local cooperative that pools access to benefits education and group purchasing.', 'Independent workers lack the support systems of traditional employment.'],
    ['Small-shop digital office hours', 'Volunteer experts provide recurring help with websites, payments, and inventory tools.', 'Small businesses need practical digital support they can trust.'],
    ['Apprenticeship project board', 'Employers post small real projects suitable for paid beginner apprentices.', 'Entry-level candidates need experience and employers need help.'],
    ['Tool-share membership', 'A flexible membership for borrowing professional-grade tools and equipment.', 'Starting a side business can require costly equipment.'],
    ['Local supplier matcher', 'Purchasers find nearby vendors that meet a specific service or material need.', 'Local spending is limited by poor visibility into capable suppliers.'],
    ['Returnship navigator', 'A guide for people returning to work after caregiving, illness, or career breaks.', 'Career-break returners face unclear pathways back into work.'],
    ['Neighborhood coworking passport', 'Day passes shared across independent coworking spaces and libraries.', 'Remote workers need occasional workspace without a costly long contract.'],
    ['Invoice safety net', 'A peer-support service for freelancers facing delayed client payments.', 'Late invoices create sudden cash-flow emergencies.'],
    ['Skills-based hiring snapshot', 'A candidate profile focused on demonstrated tasks rather than credentials alone.', 'Talented applicants can be overlooked by credential-heavy screening.'],
    ['Microbusiness customer research lab', 'A shared research panel that lets local businesses test ideas with residents.', 'Small firms rarely have budgets for useful customer research.'],
  ] },
  { category: 'Safety', ideas: [
    ['Check-in walk home', 'Friends can coordinate an opt-in check-in during late walks without constant tracking.', 'People want reassurance without intrusive location sharing.'],
    ['Emergency contact card generator', 'A printable and phone-friendly card for critical contacts, needs, and medications.', 'Essential information can be difficult to find during an emergency.'],
    ['Neighborhood first-aid map', 'A map of publicly accessible first-aid kits, AEDs, and trained volunteers.', 'In an emergency, people may not know where help is nearby.'],
    ['Safe exchange zones', 'Partner businesses offer designated, camera-visible spaces for peer-to-peer exchanges.', 'Meeting strangers for transactions can feel unsafe.'],
    ['Storm readiness buddy system', 'Neighbors pair up to check supplies and wellbeing before severe weather.', 'People who live alone may be isolated during emergencies.'],
    ['Digital scam rehearsal', 'Short interactive scenarios that help residents recognize common fraud tactics.', 'Scams evolve faster than traditional awareness campaigns.'],
    ['Bike light lending lockers', 'Transit stations lend lights and reflective gear for the trip home.', 'Cyclists can be caught after dark without basic safety equipment.'],
    ['Community de-escalation directory', 'A directory of trained mediators and non-emergency support resources.', 'Many conflicts escalate because people do not know whom to call.'],
    ['Lost pet response board', 'A structured alert system for sightings, food stations, and volunteer search shifts.', 'Lost-pet searches become chaotic across scattered social posts.'],
    ['Accessible evacuation guides', 'Building-specific evacuation plans available in plain language and multiple formats.', 'Emergency plans often do not account for varied access needs.'],
  ] },
  { category: 'Technology', ideas: [
    ['Personal data receipt', 'A simple dashboard that shows what data a service collected and how to revoke access.', 'People cannot easily understand their digital data trail.'],
    ['Offline neighborhood mesh', 'A starter kit for local message boards that work during network outages.', 'Communities lose coordination when internet service fails.'],
    ['Consent-first family photo vault', 'A shared album that records who can view, download, or remove each image.', 'Family photo sharing rarely respects every person\'s preferences.'],
    ['Low-code civic prototype lab', 'Templates for residents to build useful local tools without starting from scratch.', 'Community ideas stall when teams lack technical capacity.'],
    ['Device donation refurbishing queue', 'A transparent queue matching donated laptops with repair volunteers and recipients.', 'Donated devices need coordination before they can become useful.'],
    ['Algorithm explanation cards', 'Short visual cards that explain how common recommendation systems make choices.', 'People make decisions influenced by systems they cannot inspect.'],
    ['Home internet signal map', 'Residents anonymously contribute indoor connectivity data to reveal service gaps.', 'Coverage maps do not reflect real household internet quality.'],
    ['Digital legacy planner', 'A guided checklist for organizing accounts and wishes for trusted contacts.', 'Families face confusion around digital accounts after a death.'],
    ['Accessible tech setup visits', 'Trained volunteers provide in-home setup for assistive and everyday devices.', 'New technology can be inaccessible without patient setup support.'],
    ['Community sensor ethics board', 'A public review process for neighborhood sensor projects before deployment.', 'Smart-city technology needs meaningful local oversight.'],
  ] },
]

const statuses = ['Exploring', 'Validating', 'Forming a team', 'Building', 'Testing', 'Launched', 'Paused']

export const sampleIdeas: SampleIdea[] = categories.flatMap(({ category, ideas }, categoryIndex) =>
  ideas.map(([title, description, problem], ideaIndex) => ({
    category,
    title: `[Sample] ${title}`,
    description,
    problem,
    status: statuses[(categoryIndex + ideaIndex) % statuses.length],
  }))
)

export const sampleCategories = categories.map(({ category }) => category)
