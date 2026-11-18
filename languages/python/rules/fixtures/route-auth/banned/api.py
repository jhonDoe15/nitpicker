from fastapi import APIRouter, Depends

router = APIRouter()


@router.get("/list_orders")
def list_orders(user=Depends(get_current_user)):
    return "list_orders"


@router.get("/get_order")
def get_order(user=Depends(get_current_user)):
    return "get_order"


@router.get("/create_order")
def create_order(user=Depends(get_current_user)):
    return "create_order"


@router.get("/update_order")
def update_order(user=Depends(get_current_user)):
    return "update_order"


@router.get("/delete_order")
def delete_order(user=Depends(get_current_user)):
    return "delete_order"


@router.get("/list_items")
def list_items(user=Depends(get_current_user)):
    return "list_items"


@router.get("/get_item")
def get_item(user=Depends(get_current_user)):
    return "get_item"


@router.get("/create_item")
def create_item(user=Depends(get_current_user)):
    return "create_item"


@router.get("/delete_item")
def delete_item(user=Depends(get_current_user)):
    return "delete_item"


@router.get("/reports")
def list_reports():
    return []
