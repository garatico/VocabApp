#!/usr/bin/env python3
"""
infer_domains.py
================
Keyword-based domain assignment for Spanish words currently stuck on
["general"] or ["essential"] (7,620 words).

Matches against English translation + glosses. Adds specific domains
while preserving "essential"/"curated" tags.

Usage:
    python backend/scripts/data/infer_domains.py [--dry-run]
"""

import argparse
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
JSONL_PATH   = PROJECT_ROOT / 'data' / 'curated' / 'spanish_curated.jsonl'
DB_PATH      = PROJECT_ROOT / 'data' / 'vocabulary.db'

# ── Domain keyword map ─────────────────────────────────────────────────────────
# Keys are domain names, values are word sets matched against the
# English translation and glosses (lowercased, word-boundary match).

DOMAIN_KEYWORDS: dict[str, set[str]] = {
    'food': {
        'eat','food','cook','meal','fruit','vegetable','meat','fish','bread',
        'cheese','soup','salad','drink','beer','wine','coffee','tea','sugar',
        'salt','rice','potato','chicken','beef','pork','flour','butter','milk',
        'egg','sauce','spice','herb','oil','vinegar','flavor','taste','hungry',
        'thirst','kitchen','restaurant','recipe','ingredient','bake','fry',
        'roast','boil','grill','dessert','cake','pie','pasta','noodle',
        'sandwich','toast','cereal','cream','honey','jam','chocolate','candy',
        'snack','diet','nutrition','calorie','menu','feast','appetite','cuisine',
        'seafood','shrimp','lobster','oyster','clam','avocado','tomato','onion',
        'garlic','pepper','lemon','orange','apple','banana','grape','strawberry',
        'melon','watermelon','pineapple','mango','peach','plum','cherry',
    },
    'animals': {
        'dog','cat','fish','bird','horse','cow','pig','chicken','animal','wolf',
        'lion','tiger','bear','rabbit','snake','insect','bee','ant','butterfly',
        'whale','shark','eagle','owl','duck','sheep','goat','deer','monkey',
        'elephant','frog','turtle','lizard','crocodile','parrot','dove','crow',
        'sparrow','swallow','salmon','trout','cod','tuna','octopus','squid',
        'dolphin','seal','penguin','flamingo','peacock','turkey','hen','rooster',
        'donkey','mule','camel','giraffe','zebra','rhino','hippo','gorilla',
        'chimpanzee','mouse','rat','squirrel','fox','deer','reindeer','moose',
        'bat','beetle','fly','mosquito','spider','worm','snail','crab',
    },
    'body': {
        'head','hand','arm','leg','face','eye','ear','mouth','nose','foot',
        'shoulder','chest','back','throat','skin','heart','brain','blood',
        'bone','muscle','finger','toe','nail','knee','elbow','wrist','ankle',
        'hip','neck','chin','cheek','forehead','tongue','tooth','lip','jaw',
        'skull','spine','rib','lung','liver','kidney','stomach','intestine',
        'vein','artery','nerve','hair','eyebrow','eyelash','beard','mustache',
        'palm','heel','sole','knuckle','temple','brow',
    },
    'family': {
        'mother','father','son','daughter','brother','sister','wife','husband',
        'family','parent','child','grandparent','grandmother','grandfather',
        'aunt','uncle','cousin','nephew','niece','relative','ancestor',
        'sibling','spouse','widow','widower','orphan','twin','baby','infant',
        'toddler','teenager','adult','elderly','senior','generation',
        'stepmother','stepfather','stepson','stepdaughter','godfather',
        'godmother','in-law','fiancé','fiancée','newborn',
    },
    'health': {
        'doctor','hospital','medicine','disease','illness','pain','treatment',
        'surgery','health','sick','fever','wound','pill','drug','nurse',
        'patient','symptom','diagnosis','cure','pharmacy','clinic','injury',
        'accident','emergency','ambulance','therapy','vaccine','virus',
        'bacteria','infection','allergy','cancer','diabetes','depression',
        'anxiety','heart attack','stroke','fracture','blood pressure',
        'prescription','antibiotic','vitamin','mineral','supplement',
        'diet','exercise','wellness','hygiene','dental','optical',
        'headache','nausea','vomit','diarrhea','constipation','rash',
    },
    'education': {
        'school','university','study','student','teacher','class','book',
        'lesson','homework','exam','grade','knowledge','learn','professor',
        'lecture','degree','diploma','course','library','pencil','notebook',
        'dictionary','classroom','campus','faculty','tutor','pupil',
        'kindergarten','primary','secondary','academy','college','institute',
        'scholarship','thesis','research','laboratory','science','history',
        'mathematics','literature','geography','physics','chemistry','biology',
        'philosophy','psychology','sociology','economics','language','grammar',
        'spelling','reading','writing','arithmetic',
    },
    'work': {
        'work','job','office','business','money','company','employee','boss',
        'salary','profession','career','industry','economy','market','trade',
        'finance','bank','invest','profit','budget','accountant','manager',
        'colleague','meeting','project','contract','deadline','client',
        'customer','product','service','department','organization','institution',
        'factory','workshop','labor','union','strike','unemployment','hire',
        'fire','promotion','retire','pension','income','expense','tax',
        'invoice','receipt','salary','wage','bonus','commission','freelance',
    },
    'travel': {
        'travel','trip','hotel','airport','train','bus','road','map','passport',
        'visa','tourism','flight','ticket','luggage','border','destination',
        'tourist','guide','reservation','journey','voyage','cruise','tour',
        'itinerary','accommodation','hostel','motel','resort','check-in',
        'boarding','departure','arrival','delay','transfer','connection',
        'customs','immigration','currency','exchange','souvenir','adventure',
        'backpack','suitcase','camera','guide book',
    },
    'nature': {
        'tree','flower','river','mountain','forest','sea','sky','sun','moon',
        'star','cloud','rain','wind','earth','stone','grass','leaf','root',
        'beach','desert','lake','ocean','island','valley','hill','soil',
        'plant','seed','branch','trunk','bark','moss','fern','bush','shrub',
        'glacier','volcano','earthquake','tsunami','hurricane','tornado',
        'lightning','thunder','snow','ice','frost','fog','mist','dew',
        'waterfall','creek','stream','bay','cape','peninsula','cliff',
        'cave','canyon','plateau','plain','prairie','meadow','swamp',
    },
    'home': {
        'house','home','room','door','window','floor','ceiling','wall','chair',
        'table','bed','sofa','pillow','blanket','carpet','lamp','shelf',
        'closet','wardrobe','drawer','desk','mirror','sink','toilet','shower',
        'bathtub','fridge','oven','microwave','dishwasher','washing machine',
        'vacuum','broom','mop','bucket','furniture','decoration','curtain',
        'blind','tile','brick','paint','wallpaper','roof','chimney','garage',
        'basement','attic','balcony','porch','terrace','garden','fence','gate',
    },
    'clothing': {
        'wear','cloth','shirt','pants','dress','shoe','jacket','coat','hat',
        'sock','underwear','suit','tie','skirt','sweater','belt','scarf',
        'glove','boot','sandal','fabric','fashion','style','outfit','costume',
        'uniform','jersey','shorts','jeans','blouse','cardigan','hoodie',
        'vest','cape','cloak','robe','gown','pajama','swimsuit','bikini',
        'bra','collar','sleeve','hem','pocket','zip','button','thread','needle',
        'tailor','seamstress','textile','linen','cotton','wool','silk','leather',
    },
    'transport': {
        'car','bus','train','plane','ship','bicycle','motorcycle','taxi',
        'subway','drive','fly','sail','transport','vehicle','engine','wheel',
        'fuel','highway','bridge','tunnel','traffic','pedestrian','driver',
        'passenger','pilot','captain','sailor','truck','van','lorry',
        'helicopter','speedboat','ferry','tram','metro','cable car',
        'scooter','skateboard','rollerblades','parking','garage','petrol',
        'diesel','electric','hybrid','speed','brake','steering','license',
    },
    'technology': {
        'computer','phone','internet','software','hardware','digital','screen',
        'keyboard','mouse','data','network','app','website','program','code',
        'machine','robot','electronic','device','smartphone','tablet','laptop',
        'server','database','algorithm','artificial','intelligence','wifi',
        'bluetooth','cable','battery','charger','signal','television','radio',
        'camera','satellite','laser','semiconductor','microchip','processor',
        'memory','storage','download','upload','stream','social media',
    },
    'emotions': {
        'happy','sad','angry','fear','love','hate','joy','grief','hope',
        'despair','emotion','feeling','mood','surprised','worried','calm',
        'excited','bored','lonely','proud','shame','guilt','envy','jealous',
        'nervous','anxious','depressed','content','satisfied','frustrated',
        'disappointed','amused','nostalgic','melancholy','euphoria','panic',
        'rage','fury','sorrow','regret','relief','gratitude','affection',
        'admire','respect','trust','distrust','compassion','empathy',
    },
    'sports': {
        'sport','game','play','team','ball','goal','win','lose','race','match',
        'athlete','football','basketball','tennis','swimming','running',
        'exercise','gym','coach','player','champion','tournament','olympic',
        'medal','trophy','score','referee','stadium','court','field','track',
        'cycling','skiing','boxing','wrestling','martial arts','golf','rugby',
        'volleyball','baseball','softball','cricket','badminton','table tennis',
        'gymnastics','athletics','triathlon','marathon','sprint','relay','jump',
    },
    'politics': {
        'government','president','minister','parliament','election','vote',
        'party','law','constitution','democracy','republic','policy','leader',
        'nation','state','authority','senator','congress','candidate','ballot',
        'campaign','reform','revolution','protest','diplomacy','treaty',
        'ambassador','embassy','sanction','ally','opposition','monarchy',
        'emperor','king','queen','prime minister','governor','mayor',
        'council','committee','legislation','bill','decree','order',
    },
    'military': {
        'soldier','army','war','weapon','gun','bomb','attack','defense',
        'battle','combat','military','officer','rank','command','enemy',
        'troops','navy','air force','marine','infantry','artillery','tank',
        'missile','nuclear','spy','intelligence','strategy','tactic',
        'siege','surrender','victory','defeat','casualty','prisoner',
        'patrol','mission','operation','base','headquarters','uniform',
        'badge','general','colonel','captain','lieutenant','sergeant',
    },
    'religion': {
        'god','prayer','church','temple','faith','belief','soul','spirit',
        'holy','sacred','sin','heaven','hell','angel','devil','religious',
        'worship','ritual','ceremony','blessing','curse','miracle','saint',
        'bible','quran','torah','priest','monk','nun','mosque','synagogue',
        'cathedral','chapel','mass','sermon','baptism','communion','meditation',
        'karma','reincarnation','paradise','pilgrimage','prophet','apostle',
    },
    'geography': {
        'country','city','village','region','province','capital','continent',
        'east','west','north','south','location','place','area','territory',
        'border','coast','latitude','longitude','equator','pole','hemisphere',
        'urban','rural','suburban','metropolitan','district','municipality',
        'prefecture','county','township','neighborhood','avenue','street',
        'square','plaza','harbor','port','canal','dam',
    },
    'art_culture': {
        'art','paint','draw','sculpture','museum','gallery','artist','creative',
        'design','image','photo','film','theater','actor','perform','music',
        'song','sing','instrument','concert','dance','literature','novel',
        'poem','story','myth','legend','tradition','culture','heritage',
        'festival','carnival','exhibition','masterpiece','style','genre',
        'melody','harmony','rhythm','opera','ballet','jazz','folk','classical',
    },
    'law': {
        'law','legal','court','judge','lawyer','attorney','crime','criminal',
        'police','arrest','trial','sentence','prison','jail','fine','penalty',
        'rights','justice','innocent','guilty','verdict','evidence','witness',
        'prosecutor','defendant','appeal','constitution','regulation','rule',
        'contract','agreement','property','ownership','liability','copyright',
        'patent','trademark','treaty','statute','ordinance','ban','prohibition',
    },
    'science': {
        'science','experiment','theory','hypothesis','research','discovery',
        'element','atom','molecule','cell','organism','evolution','gravity',
        'force','energy','matter','mass','velocity','acceleration','frequency',
        'wave','radiation','magnetic','electric','chemical','reaction',
        'equation','formula','variable','laboratory','microscope','telescope',
        'physicist','chemist','biologist','geologist','astronomer',
    },
    'time': {
        'time','hour','minute','second','day','week','month','year',
        'morning','afternoon','evening','night','today','yesterday','tomorrow',
        'century','decade','era','period','moment','instant','duration',
        'schedule','calendar','clock','watch','date','season','spring',
        'summer','autumn','winter','dawn','dusk','midnight','noon',
        'ancient','modern','contemporary','future','past','present',
    },
    'numbers_quantity': {
        'number','count','amount','quantity','total','sum','half','quarter',
        'double','triple','percent','fraction','decimal','zero','hundred',
        'thousand','million','billion','infinity','measure','weight','volume',
        'length','width','height','depth','size','scale','ratio','proportion',
    },
    'communication': {
        'speak','talk','say','tell','ask','answer','question','conversation',
        'language','word','sentence','phrase','meaning','translate','interpret',
        'write','read','letter','message','email','call','text','announce',
        'declare','explain','describe','discuss','argue','debate','negotiate',
        'greet','introduce','apologize','thank','complain','promise','warn',
    },
    'mind_thought': {
        'think','idea','thought','memory','imagine','dream','believe','know',
        'understand','reason','logic','opinion','view','perspective','concept',
        'theory','philosophy','wisdom','intelligence','consciousness','mind',
        'brain','attention','focus','concentration','creativity','intuition',
        'judgment','decision','choice','preference','opinion','doubt',
    },
}


def get_search_text(entry: dict) -> str:
    """Combine translation and all glosses into one lowercase string."""
    parts = []
    if entry.get('translation'):
        parts.append(entry['translation'])
    for g in (entry.get('glosses') or []):
        if g:
            parts.append(g)
    return ' '.join(parts).lower()


def match_domains(text: str) -> list[str]:
    """Return list of matched domain names (may be empty)."""
    words = set(re.findall(r'\b\w+\b', text))
    matched = []
    for domain, keywords in DOMAIN_KEYWORDS.items():
        if keywords & words:
            matched.append(domain)
    return matched


def run(dry_run: bool = False) -> None:
    entries = []
    with open(JSONL_PATH, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))

    domain_counter = Counter()
    changed        = 0

    for e in entries:
        existing = set(e.get('domains') or [])

        # Only enrich words that are stuck on generic domains
        if not (existing <= {'general', 'essential', ''}):
            continue  # already has specific domains — leave alone

        text    = get_search_text(e)
        matched = match_domains(text)

        if not matched:
            continue

        new_domains = list(matched)
        if 'essential' in existing:
            new_domains.insert(0, 'essential')  # preserve essential tag

        if not dry_run:
            e['domains'] = new_domains

        for d in matched:
            domain_counter[d] += 1
        changed += 1

    print(f'Words enriched with specific domains: {changed}')
    print('\nDomain assignment counts:')
    for domain, n in domain_counter.most_common():
        print(f'  {domain:20s}: {n}')

    if dry_run:
        print('\n[DRY RUN — no changes written]')
        return

    # Write updated JSONL
    with open(JSONL_PATH, 'w', encoding='utf-8') as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')
    print(f'\nJSONL updated: {JSONL_PATH.name}')

    # Patch DB
    conn = sqlite3.connect(str(DB_PATH))
    with conn:
        db_updated = 0
        for e in entries:
            if e.get('domains') and e['domains'] != ['general']:
                rows = conn.execute(
                    "UPDATE words SET domains=?, updated_at=CURRENT_TIMESTAMP "
                    "WHERE word=? AND language='spanish'",
                    (json.dumps(e['domains'], ensure_ascii=False), e['word'])
                ).rowcount
                db_updated += rows
    conn.close()
    print(f'DB rows updated: {db_updated}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    run(args.dry_run)
