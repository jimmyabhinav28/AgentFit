#!/usr/bin/env python3
"""Builds public/data/foods.json: common local items for the likes/dislikes step (Journey 6b)
and the city/state -> region lookup. Run: python3 tools/build-foods.py"""
import json, os

def items(rows):
    out = []
    for r in rows.strip().splitlines():
        name, note, tags = [x.strip() for x in r.split('|')]
        out.append({'name': name, 'note': note, 'tags': [t for t in tags.split(',') if t]})
    return out

PAN = items("""
Dal tadka | Lentils tempered with spices | veg,protein
Rajma | Kidney bean curry | veg,protein
Chole | Spiced chickpea curry | veg,protein
Paneer | Fresh cottage cheese, many ways | veg,dairy,protein
Curd / dahi | Plain yogurt | veg,dairy
Roti / chapati | Whole wheat flatbread | veg
Rice | Steamed rice | veg
Khichdi | Rice and lentils cooked together | veg,protein
Poha | Flattened rice with peas and peanuts | veg
Upma | Semolina with vegetables | veg
Sprouts salad | Sprouted moong with onion and lemon | veg,protein
Soya chunks | High-protein soy pieces | veg,protein
Tofu | Soy curd | veg,protein,vegan
Besan chilla | Chickpea-flour savoury pancake | veg,protein
Moong dal | Split green gram | veg,protein
Palak | Spinach dishes | veg
Bhindi | Okra stir-fry | veg
Lauki | Bottle gourd | veg
Karela | Bitter gourd | veg
Baingan | Brinjal / eggplant | veg
Aloo | Potato dishes | veg,root_veg
Mixed veg sabzi | Seasonal vegetables | veg
Egg bhurji | Spiced scrambled eggs | egg,protein
Boiled eggs | Plain boiled eggs | egg,protein
Omelette | Masala omelette | egg,protein
Chicken curry | Home-style chicken curry | chicken,protein
Tandoori chicken | Grilled spiced chicken | chicken,protein
Fish curry | Fish in spiced gravy | fish,protein
Mutton curry | Goat curry | mutton,protein
Peanuts | Roasted or boiled peanuts | veg,protein
Makhana | Roasted fox nuts | veg
Banana | Banana | veg,fruit
Guava | Guava | veg,fruit
Papaya | Papaya | veg,fruit
Oats | Oats porridge or savoury oats | veg
Buttermilk | Spiced chaas | veg,dairy
""")

REGIONS = {
 'south': items("""
Idli | Steamed rice and lentil cakes | veg
Dosa | Rice and lentil crepe | veg
Sambar | Lentil and vegetable stew | veg,protein
Rasam | Tangy pepper broth | veg
Ragi mudde | Finger millet balls | veg
Ragi dosa | Finger millet crepe | veg
Pongal | Rice and moong with pepper and ghee | veg
Curd rice | Rice with yogurt | veg,dairy
Avial | Mixed vegetables in coconut and curd | veg
Beans palya | Beans stir-fry with coconut | veg
Kootu | Vegetables and lentils | veg,protein
Pesarattu | Green gram dosa | veg,protein
Appam | Fermented rice pancake | veg
Puttu | Steamed rice flour and coconut | veg
Bisi bele bath | Spiced rice, lentils and vegetables | veg,protein
Lemon rice | Rice with lemon and peanuts | veg
Coconut chutney | Fresh coconut chutney | veg
Kerala fish curry | Fish in coconut or kokum gravy | fish,protein
Chettinad chicken | Peppery chicken curry | chicken,protein
Egg roast | Kerala-style egg masala | egg,protein
Sundal | Spiced boiled chickpeas or beans | veg,protein
Tender coconut | Coconut water | veg
"""),
 'north': items("""
Aloo paratha | Potato-stuffed flatbread | veg,root_veg
Paneer paratha | Paneer-stuffed flatbread | veg,dairy,protein
Kadhi | Yogurt and gram flour curry | veg,dairy
Dal makhani | Creamy black lentils | veg,dairy,protein
Sarson ka saag | Mustard greens | veg
Makki roti | Maize flatbread | veg
Paneer tikka | Grilled spiced paneer | veg,dairy,protein
Palak paneer | Paneer in spinach | veg,dairy,protein
Matar paneer | Paneer with peas | veg,dairy,protein
Lassi | Sweet or salted yogurt drink | veg,dairy
Raita | Yogurt with vegetables | veg,dairy
Kulcha | Leavened flatbread | veg
Chana masala | Spiced chickpeas | veg,protein
Butter chicken | Chicken in tomato-butter gravy | chicken,protein
Chicken tikka | Grilled chicken pieces | chicken,protein
Keema | Minced meat curry | mutton,protein
Daliya | Broken wheat porridge | veg
Sattu drink | Roasted gram drink | veg,protein
Gobhi sabzi | Cauliflower stir-fry | veg
Arbi | Taro root | veg,root_veg
"""),
 'east': items("""
Litti chokha | Sattu-stuffed wheat balls with mash | veg,protein
Sattu paratha | Gram-flour stuffed flatbread | veg,protein
Machher jhol | Light Bengali fish curry | fish,protein
Shukto | Bitter-sweet vegetable stew | veg
Cholar dal | Bengal gram dal | veg,protein
Aloo posto | Potatoes in poppy seed paste | veg,root_veg
Dalma | Lentils with vegetables | veg,protein
Pakhala | Fermented water rice | veg
Ghugni | Dried pea curry | veg,protein
Chingri malai | Prawns in coconut | fish,protein
Egg curry | Bengali egg curry | egg,protein
Mishti doi | Sweet yogurt | veg,dairy
Muri | Puffed rice snack | veg
Chana chaat | Chickpea salad | veg,protein
Saag | Leafy greens | veg
Kosha mangsho | Slow-cooked mutton | mutton,protein
"""),
 'west': items("""
Poha | Flattened rice with peanuts | veg
Thepla | Spiced fenugreek flatbread | veg
Dhokla | Steamed gram flour cake | veg,protein
Khandvi | Gram flour rolls | veg
Undhiyu | Mixed winter vegetables | veg
Misal pav | Sprout curry with bread | veg,protein
Usal | Sprouted bean curry | veg,protein
Varan bhaat | Plain dal and rice | veg
Bhakri | Millet flatbread | veg
Pithla | Gram flour curry | veg,protein
Kokum curry | Kokum and coconut drink/curry | veg
Sol kadhi | Kokum and coconut milk | veg
Goan fish curry | Coconut fish curry | fish,protein
Chicken xacuti | Goan spiced chicken | chicken,protein
Sabudana khichdi | Sago with peanuts | veg
Bajra roti | Pearl millet flatbread | veg
"""),
 'northeast': items("""
Jadoh | Rice cooked with meat | meat,protein
Masor tenga | Sour fish curry | fish,protein
Thukpa | Noodle soup | veg
Momos (veg) | Steamed dumplings | veg
Momos (chicken) | Steamed chicken dumplings | chicken,protein
Bamboo shoot curry | Bamboo shoot with vegetables | veg
Black rice | Fragrant black rice | veg
Axone dishes | Fermented soybean | veg,protein
Smoked pork | Smoked pork curry | pork,meat,protein
Khar | Alkaline vegetable dish | veg
"""),
}

GLOBAL = items("""
Oatmeal | Oats with milk or water | veg
Greek yogurt | Thick strained yogurt | veg,dairy,protein
Eggs | Boiled, scrambled or omelette | egg,protein
Chicken breast | Grilled or baked | chicken,protein
Salmon | Baked or grilled | fish,protein
Tuna | Canned or fresh | fish,protein
Beans | Black, kidney or pinto | veg,protein
Lentils | Lentil soup or salad | veg,protein
Tofu | Stir-fried or baked | veg,protein,vegan
Quinoa | Quinoa bowls | veg
Brown rice | Brown rice | veg
Whole-wheat pasta | Pasta | veg
Wholegrain bread | Toast and sandwiches | veg
Cottage cheese | Cottage cheese | veg,dairy,protein
Broccoli | Broccoli | veg
Spinach | Spinach | veg
Sweet potato | Baked sweet potato | veg,root_veg
Avocado | Avocado | veg
Peanut butter | Peanut butter | veg,protein
Mixed nuts | Almonds, walnuts, cashews | veg
Berries | Berries | veg,fruit
Apple | Apple | veg,fruit
Banana | Banana | veg,fruit
Hummus | Chickpea dip | veg,protein
""")

# Lowercase keywords (cities and states) -> region
REGION_KEYS = {
 'south': 'bengaluru bangalore mysuru mysore mangaluru mangalore hubli karnataka chennai madurai coimbatore tamil nadu tiruchirappalli trichy salem kochi cochin kerala thiruvananthapuram trivandrum kozhikode calicut thrissur hyderabad secunderabad telangana warangal andhra pradesh vijayawada visakhapatnam vizag tirupati guntur puducherry pondicherry',
 'north': 'delhi new delhi noida gurugram gurgaon faridabad ghaziabad punjab chandigarh ludhiana amritsar jalandhar haryana panipat uttar pradesh lucknow kanpur agra varanasi prayagraj allahabad meerut uttarakhand dehradun himachal shimla jammu srinagar kashmir rajasthan jaipur jodhpur udaipur kota madhya pradesh bhopal indore gwalior jabalpur',
 'east': 'kolkata calcutta west bengal howrah siliguri durgapur bihar patna gaya bhagalpur muzaffarpur odisha bhubaneswar cuttack puri jharkhand ranchi jamshedpur dhanbad chhattisgarh raipur bilaspur',
 'west': 'mumbai bombay pune nagpur nashik thane navi mumbai aurangabad maharashtra gujarat ahmedabad surat vadodara baroda rajkot goa panaji margao',
 'northeast': 'assam guwahati dibrugarh shillong meghalaya manipur imphal nagaland kohima dimapur mizoram aizawl tripura agartala arunachal itanagar sikkim gangtok',
}

out = {'version': 1, 'india': {'common': PAN, 'regions': REGIONS}, 'global': GLOBAL, 'regionKeys': REGION_KEYS}
path = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'foods.json')
with open(path, 'w') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print('foods ->', os.path.normpath(path), {k: len(v) for k, v in REGIONS.items()}, len(PAN), len(GLOBAL))
