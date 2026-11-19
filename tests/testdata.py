import json, time, math, random
random.seed(11)
def lv(price, up, n, amt):
    out=[]; p=price
    for i in range(n):
        out.append({"amount":amt() ,"pricePerUnit":round(p,1),"orders":random.randint(1,6)})
        step=max(0.1, round(abs(p)*0.0005,1))
        p = p+step if up else max(0.1,p-step)
    return out
def prod(pid, bo, so, wb, ws, n=30, amt=None, qs_extra=None, qs=True):
    amt = amt or (lambda: random.randint(1, 50000))
    d={"product_id":pid,"sell_summary":lv(bo,False,n,amt) if bo else [],"buy_summary":lv(so,True,n,amt) if so else []}
    if qs:
        d["quick_status"]={"productId":pid,"sellPrice":round(bo*random.uniform(0.97,1.0),1) if bo else 0,"sellVolume":random.randint(1000,10**6),
          "sellMovingWeek":ws,"sellOrders":random.randint(1,500),"buyPrice":round(so*random.uniform(1.0,1.03),1) if so else 0,
          "buyVolume":random.randint(1000,10**6),"buyMovingWeek":wb,"buyOrders":random.randint(1,500)}
        if qs_extra: d["quick_status"].update(qs_extra)
    return d
def realistic():
    P={}
    base=[("DIAMOND",8.6,3e7,2.8e7),("ENCHANTED_DIAMOND",1560,2e6,1.8e6),("ENCHANTED_DIAMOND_BLOCK",2019845,4e5,3.5e5),
          ("SUGAR_CANE",1.9,5e7,6e7),("ENCHANTED_SUGAR",290,4e6,4.2e6),("ENCHANTED_SUGAR_CANE",21500,1.2e6,1.1e6),
          ("COAL",2.4,2e7,2.1e7),("ENCHANTED_COAL",150,5e6,6e6),("ENCHANTED_COAL_BLOCK",24500,4e5,4.5e5),
          ("BOOSTER_COOKIE",3350000,4e4,3.6e4),("ENCHANTMENT_ULTIMATE_WISE_5",1520000,3e3,2.5e3),("ESSENCE_WITHER",3000,9e5,8e5),
          ("TITANIUM_ORE",9800,4e5,3.9e5),("ENCHANTED_TITANIUM",1570000,2e4,2.2e4),("RECOMBOBULATOR_3000",9200000,6e3,5e3),
          ("HOT_POTATO_BOOK",80000,2e5,1.8e5),("FUMING_POTATO_BOOK",1150000,2e4,1.9e4),("KISMET_FEATHER",2600000,1.2e4,1.1e4),
          ("WHEAT",2.2,4e7,3.9e7),("ENCHANTED_BREAD",120,3e6,3.1e6),("HAY_BLOCK",21,6e6,6.2e6),("ENCHANTED_HAY_BALE",3100,9e5,8.8e5),
          ("IRON_INGOT",3.5,3e7,3.2e7),("ENCHANTED_IRON",560,4e6,4.1e6),("ENCHANTED_IRON_BLOCK",90000,2e5,2.1e5),
          ("GOLD_INGOT",4.1,2e7,2.2e7),("ENCHANTED_GOLD",660,3e6,3.2e6),("ENCHANTED_GOLD_BLOCK",107000,1.5e5,1.6e5)]
    for pid,mid,wb,ws in base:
        sp=max(0.2, mid*random.uniform(0.005,0.08)); bo=round(mid-sp/2,1); so=round(mid+sp/2,1)
        if so<=bo: so=round(bo+0.2,1)
        P[pid]=prod(pid,bo,so,int(wb),int(ws), amt=(lambda: random.randint(1,300)) if mid>1e5 else None)
    return P
def edge():
    P=realistic()
    P["EMPTY_BOTH"]=prod("EMPTY_BOTH",0,0,0,0)
    P["NO_SELL_OFFERS"]=prod("NO_SELL_OFFERS",100,0,5000,6000)
    P["NO_BUY_ORDERS"]=prod("NO_BUY_ORDERS",0,120,5000,6000)
    P["TIGHT_SPREAD"]=prod("TIGHT_SPREAD",10.0,10.1,9e6,9e6)
    P["CROSSED_BOOK"]=prod("CROSSED_BOOK",50.0,45.0,9e6,9e6)
    P["HUGE_PRICE"]=prod("HUGE_PRICE",2.4e9,2.6e9,500,480, amt=lambda: random.randint(1,3))
    P["TINY_PRICE"]=prod("TINY_PRICE",0.1,0.3,9e7,9e7)
    P["MISSING_QS"]=prod("MISSING_QS",500,560,1,1,qs=False)
    P["NULL_FIELDS"]=prod("NULL_FIELDS",500,560,0,0,qs_extra={"buyMovingWeek":None,"sellMovingWeek":None,"buyPrice":None,"sellPrice":None})
    P["INK_SACK:3"]=prod("INK_SACK:3",5.1,6.3,2e7,2.1e7)
    P["XSS_ITEM"]=prod("XSS_ITEM",1000,1100,9e6,9e6)
    P["SHALLOW_BOOK"]=prod("SHALLOW_BOOK",1000,1080,9e6,9e6,n=2,amt=lambda: 10)
    P["SPIKE_ORDER"]=prod("SPIKE_ORDER",1000,1300,9e6,9e6,qs_extra={"buyPrice":2000.0,"sellPrice":1000.0})
    P["POINT_THREE"]=prod("POINT_THREE",0.3,0.7,9e7,9e7)
    P["ODD_DECIMALS"]=prod("ODD_DECIMALS",1234.5,1299.9,9e6,9e6)
    return P
ITEMS_EXTRA=[{"id":"XSS_ITEM","name":'<img src=x onerror="window.__xss=1">Böses Item',"tier":"RARE"},
             {"id":"ENCHANTED_COAL","name":"Enchanted Coal","tier":"UNCOMMON","npc_sell_price":160},
             {"id":"SUGAR_CANE","name":"Sugar Cane","tier":"COMMON","npc_sell_price":2},
             {"id":"TINY_PRICE","name":"Tiny","tier":"COMMON","npc_sell_price":0.5},
             {"id":"WHEAT","name":"Wheat","tier":"COMMON","npc_sell_price":3}]
